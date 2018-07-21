package main

import (
	"os"
	"github.com/labstack/echo"
	"github.com/labstack/echo/middleware"
	"log"
	"net/http"
	"io/ioutil"
	"encoding/json"
	"github.com/go-redis/redis"
	"strconv"
	"time"
	"gopkg.in/mgo.v2/bson"
	"bytes"
	"gopkg.in/Shopify/sarama.v1"
)

const(
	SELL_ORDER_ZSET = "sell_order_zset"
	SELL_ORDER_SET = "sell_order_set"
	BUY_ORDER_ZSET = "buy_order_zset"
	BUY_ORDER_SET = "buy_order_set"
	CHANNEL_LENGTH= 4
)


type Transactions struct {
	ID        bson.ObjectId `bson:"_id,omitempty"`
	Name      string
	Phone     string
	Timestamp time.Time
}

func initRedis() *redis.Client{
	redisClient := redis.NewClient(&redis.Options{
		Addr:     "localhost:6379",
		Password: "", // no password set
		DB:       0,  // use default DB
	})
	//for test
	redisClient.ScriptFlush()
	redisClient.FlushAll()
	v,err := redisClient.Ping().Result()
	if err != nil {
		log.Println("Error Connecting to redis: ", err, v)
	}
	return redisClient
}

func main(){
	hostPort := ":" + os.Getenv("MATCHMAKER_PORT")
	server := echo.New()
	server.Debug = true
	server.Use(middleware.Logger())
	server.Use(middleware.Recover())
	server.Use(middleware.CORS())
	messageChannel := make(chan map[string]map[string]interface{},CHANNEL_LENGTH)
	kafkaChannel := make(chan map[string]interface{}, CHANNEL_LENGTH)
	redisClient := initRedis()
	defer redisClient.Close()
	luaScript := getStringFromLuaFile("/src/transaction.lua")
	go transactionGenerator(messageChannel)
	go kafkaEventHandler(kafkaChannel)
	server.POST("/order", func(c echo.Context) error{
		jsonRequest, err := ioutil.ReadAll(c.Request().Body)
		log.Print("Order: ", jsonRequest)
		if err != nil {
			return c.String(500,"Invalid Request")
		}
		var body map[string]interface{}
		if err := json.Unmarshal(jsonRequest, &body); err != nil {
			return c.String(500,"Invalid json format")
		}
		orderPrice := body["order_price"].(string)
		assetType := body["asset_type"].(string)
		userId := body["user_id"].(string)
		orderType := body["order_type"].(string)
		orderId := body["order_id"].(string)
		message,err := redisClient.Eval(luaScript,[] string{orderType + ":" + assetType + ":" + userId + ":" + orderPrice + ":" + orderId},jsonRequest).Result()
		if err != nil {
			panic(err)
		}
		if message != nil && message != "success" {
			log.Print("From Redis : ", message)
			if message == "update" {
				body["operation"] = "add"
				kafkaChannel <- body
			} else {
				var messages map[string]map[string]interface{}

				if err := json.Unmarshal([]byte(message.(string)), &messages); err != nil {
					panic(err)
				}
				for _, order := range messages {
					if order["delete"].(string) == "true" {
						order["operation"] = "delete"
					} else {
						order["operation"] = "none"
					}

					log.Print(order)
					kafkaChannel <- order
				}
				//messageChannel <- messages
			}
		}

		return c.String(http.StatusOK,"Order Received\n")
	})

	server.Logger.Fatal(server.Start(hostPort))
}

func getFloat(obj map[string]interface{}, key string) float64{
	val,_ := strconv.ParseFloat(obj[key].(string),64)
	return val

}

func getStringFromLuaFile(filepath string) string {
	data, err := ioutil.ReadFile(filepath)
	if err != nil {
		panic(err)
	}
	return string(data)
}

func kafkaEventHandler(kafkaChannel chan map[string]interface{}) {
	broker := os.Getenv("KAFKA_ENDPOINT")
	log.Print("BROKER: ", broker)
	config := sarama.NewConfig()
	config.Producer.Partitioner = sarama.NewRandomPartitioner
	config.Producer.Return.Successes = true
	producerClient, err := sarama.NewSyncProducer([]string{broker}, config)
	if err != nil {
		panic(err)
	}
	defer producerClient.Close()
	for 1 == 1 {
		order := <-kafkaChannel
		topic := func() string {
			if order["order_type"].(string) == "buy" {
				return "buy_order_zset"
			} else {
				return "sell_order_zset"
			}
		}()
		payLoad := make(map[string]string,1)
		payLoad["operation"] = order["operation"].(string)
		payLoad["order_type"] = order["order_type"].(string)
		payLoad["order_price"] = order["order_price"].(string)
		jsonPayload,errJson := json.Marshal(payLoad)
		if errJson != nil {
			panic(err)
		}
		msg := &sarama.ProducerMessage{
			Topic:     topic,
			Partition: -1,
			Value:     sarama.ByteEncoder(jsonPayload),
		}
		_, _, err := producerClient.SendMessage(msg)
		if err != nil {
			panic(err)
		}
	}

}

func transactionGenerator(messageChannel chan map[string]map[string]interface{}){
	log.Println("Transaction Generator Thread started")
	client := &http.Client{}
	messageList := make([]map[string]map[string]interface{}, 0, 100)
	for 1 == 1 {
		time.Sleep(3000 * time.Millisecond)
		for i := 0; i < CHANNEL_LENGTH; i++ {
			select {
			case message := <-messageChannel:
				messageList = append(messageList, message)
			default:
				break
			}
		}
		if len(messageList) > 0 {
			items, err := json.Marshal(messageList)
			//log.Println("Message List: ", string(items))
			if err != nil {
				panic(err)
			}
			req, err := http.NewRequest("POST",os.Getenv("TRANSACTION_MANAGER") + "/transaction/save", bytes.NewBuffer(items))
			if err != nil{
				panic(err)
			}
			req.Header.Set("Content-Type","application/json")
			resp, err := client.Do(req)
			if err != nil {
				panic(err)
			}
			defer resp.Body.Close()
			log.Println("Response Status: ", resp.Status)
			messageList = messageList[len(messageList):]
		}
		//send messagaList to server

	}
}