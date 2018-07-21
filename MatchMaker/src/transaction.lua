local log = function (x) redis.log(redis.LOG_WARNING, x) end

local getId = function (obj)
    return obj['order_type'] .. ":" .. obj['asset_type'] .. ":" .. obj['user_id'] .. ":" .. obj['order_price'] .. ":" .. obj['order_id']
end


local deepcopy = function(orig)
     local orig_type = type(orig)
        local copy
        if orig_type == 'table' then
            copy = {}
            for orig_key, orig_value in pairs(orig) do
                copy[orig_key] = orig_value
            end
        else -- number, string, boolean, etc
            copy = orig
        end
        return copy
end


local orderId = KEYS[1]
local jsonString = ARGV[1]
log('Order Id: '.. orderId)
log('JSON String: '.. jsonString)

local jsonObj = cjson.decode(jsonString)
local orderPrice = jsonObj['order_price']
local orderType = jsonObj['order_type']
log('Order Price: '.. orderPrice)
log('Order Type: ' .. orderType)


if redis.call("EXISTS", KEYS[1]) == 0 then
    log('Adding new entry')
    redis.call("SET", KEYS[1], ARGV[1])
    redis.call("RPUSH", orderPrice ..'_'.. orderType, KEYS[1])
    redis.call("ZADD", orderType .. '_' .. 'order_zset', (orderType == 'buy' and -orderPrice or orderPrice), orderPrice)
end

local sellMinOrder
local buyMaxOrder

for idx,val in ipairs(redis.call("ZRANGE", "sell_order_zset", 0, 0)) do
    sellMinOrder = val
end

for idx,val in ipairs(redis.call("ZRANGE", "buy_order_zset", 0, 0)) do
    buyMaxOrder = val
end

log('Max Buy Order: ' .. (buyMaxOrder or "") .. ' Min Sell Order: ' .. (sellMinOrder or ""))

if sellMinOrder and buyMaxOrder and sellMinOrder <= buyMaxOrder then
    log('Order Matched.  <<-----------<---------<---------<----------')
    local matches = 0
    local processedOrders = {}
    local buyOrder = redis.call("LPOP", buyMaxOrder .. '_buy')
    local sellOrder = redis.call("LPOP", sellMinOrder .. "_sell")
    local buyOrderDetail = redis.call("GET", buyOrder)
    local sellOrderDetail = redis.call("GET", sellOrder)
    buyOrderDetail = cjson.decode(buyOrderDetail)
    sellOrderDetail = cjson.decode(sellOrderDetail)
    local satisfied = true
    while satisfied == true do
        log('Sell Order' .. cjson.encode(sellOrderDetail))
        log('Buy Order' .. cjson.encode(buyOrderDetail))
        log("Entered loop -------")
        if tonumber(sellOrderDetail['order_quantity']) > tonumber(buyOrderDetail['order_quantity']) then
            local sellOrderClone = deepcopy(sellOrderDetail)
            buyOrderDetail['matched_id'] = sellOrderClone['order_id']
            sellOrderClone['matched_id'] = buyOrderDetail['order_id']
            sellOrderClone['order_quantity'] = buyOrderDetail['order_quantity']
            log('Sell Clone: ' .. cjson.encode(sellOrderClone))
            buyOrderDetail['delete'] = "true"
            sellOrderClone['delete'] = "false"
            processedOrders[matches] = buyOrderDetail
            matches = matches + 1
            processedOrders[matches] = sellOrderClone
            matches = matches + 1
            sellOrderDetail['order_quantity'] = tostring(math.floor(sellOrderDetail['order_quantity'] - buyOrderDetail['order_quantity']))
            log('Updated Sell Order' .. cjson.encode(sellOrderDetail))
            buyOrder = redis.call("LPOP", buyMaxOrder .. '_buy')
            if buyOrder == false then
                redis.call("DEL", getId(buyOrderDetail))
                redis.call("LPUSH", sellMinOrder .. '_sell', sellOrder)
                redis.call("SET", sellOrder, cjson.encode(sellOrderDetail))
                redis.call("ZREM", 'buy_order_zset', buyOrderDetail['order_price'])
                satisfied = false
            else
                log("New Item popped: " .. buyOrder)
                buyOrderDetail = cjson.decode(redis.call("GET", buyOrder))
            end
        elseif tonumber(sellOrderDetail['order_quantity']) < tonumber(buyOrderDetail['order_quantity']) then
            local buyOrderClone = deepcopy(buyOrderDetail)
            sellOrderDetail['matched_id'] = buyOrderClone['order_id']
            buyOrderClone['matched_id'] = sellOrderDetail['order_id']
            buyOrderClone['order_quantity'] = sellOrderDetail['order_quantity']
            log('Buy Clone: ' .. cjson.encode(buyOrderClone))
            sellOrderDetail['delete'] = "true"
            buyOrderClone['delete'] = "false"
            processedOrders[matches] = sellOrderDetail
            matches = matches + 1
            processedOrders[matches] = buyOrderClone
            matches = matches + 1
            buyOrderDetail['order_quantity'] = tostring(math.floor(buyOrderDetail['order_quantity'] - sellOrderDetail['order_quantity']))
            sellOrder = redis.call("LPOP", sellMinOrder .. '_sell')
            log('Updated Buy Order' .. cjson.encode(buyOrderDetail))
            if sellOrder == false then
                redis.call("DEL", getId(sellOrderDetail))
                redis.call("LPUSH", buyMaxOrder .. '_buy', buyOrder)
                redis.call("SET", buyOrder, cjson.encode(buyOrderDetail))
                log("Buy Order for next round: " .. cjson.encode(buyOrderDetail) .. " \nId: " .. buyOrder)
                redis.call("ZREM", 'sell_order_zset', sellOrderDetail['order_price'])
                satisfied = false
            else
                log("New Item popped: " .. sellOrder)
                sellOrderDetail = cjson.decode(redis.call("GET", sellOrder))
            end
        else
            sellOrderDetail['matched_id'] = buyOrderDetail['order_id']
            buyOrderDetail['matched_id'] = sellOrderDetail['order_id']
            buyOrderDetail['delete'] = "true"
            sellOrderDetail['delete'] = "true"
            processedOrders[matches] = sellOrderDetail
            matches = matches + 1
            processedOrders[matches] = buyOrderDetail
            matches = matches + 1
            satisfied = false
        end
    end

    if sellOrder == false then
        log("Buy Order Excess" .. getId(buyOrderDetail) .. " : " .. buyOrderDetail['order_quantity'])
    elseif buyOrder == false then
        log("Sell Order Excess" .. getId(sellOrderDetail))
    else
        log("All Order Consumed")
    end

    log("Processed buy/sell Item: " .. matches)

    while matches > 0 do
        local key = getId(processedOrders[matches - 1])
        -- add a check here for checking excess
        if processedOrders['delete'] == 'true' then
            redis.call("DEL", key)
        end
        matches = matches - 1

        log("Processed Items: " .. key )
    end

    if #processedOrders > 0 then
        return cjson.encode(processedOrders)
    end
else
    local rank = redis.call("ZRANK", (orderType == 'buy' and 'buy_order_zset' or 'sell_order_zset'),orderPrice)
    log("Rank:" .. rank)
    if tonumber(rank) < 20 then
        return "update"
    end

end
return "success"
