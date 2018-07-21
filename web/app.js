var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var exphbs = require('express-handlebars');
var expressValidator = require('express-validator');
var flash = require('connect-flash');
var session = require('express-session');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var mongo = require('mongodb');
var mongoose = require('mongoose');
var redis = require('redis');
var request = require('request');
mongoose.connect('mongodb://root:example@127.0.0.1:27017')
var db = mongoose.connection;

var routes = require('./routes/index');
var users = require('./routes/users');

// Init App
var app = express();
var http = require('http').Server(app)
var websocket = require('socket.io')(http);

const buy_order_set = "buy_order_zset"
const sell_order_set = "sell_order_zset"
//redis init
redisClient = redis.createClient()
redisClient.on("error", function (err) {
    console.log("Error " + err);
});

var kafka = require('kafka-node'),
    Consumer = kafka.Consumer,
    client = new kafka.Client(),
    consumer = new Consumer(
        client,
        [
            { topic: sell_order_set, partition: 0 }, {topic: buy_order_set, partition:0}
        ],
        {
            autoCommit: false
        }
    );


websocket.on('connection', function(socket) {
   console.log('a user connected');
   socket.on('disconnect', function () {
      console.log('a user disconnected');
   });
});

consumer.on('message', function (message, petty) {
    console.log(message);
    websocket.sockets.emit('test_event', message)
});    

// View Engine
app.set('views', path.join(__dirname, 'views'));
app.engine('handlebars', exphbs({defaultLayout:'layout'}));
app.set('view engine', 'handlebars');

// BodyParser Middleware
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));


// Set Static Folder
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static('ojet'));
// Express Session
app.use(session({
    secret: 'secret',
    saveUninitialized: true,
    resave: true
}));

// Passport init
app.use(passport.initialize());
app.use(passport.session());

// Express Validator
app.use(expressValidator({
  errorFormatter: function(param, msg, value) {
      var namespace = param.split('.')
      , root    = namespace.shift()
      , formParam = root;

    while(namespace.length) {
      formParam += '[' + namespace.shift() + ']';
    }
    return {
      param : formParam,
      msg   : msg,
      value : value
    };
  }
}));

// Connect Flash
app.use(flash());

// Global Vars
app.use(function (req, res, next) {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error');
  res.locals.user = req.user || null;
  next();
});



app.use('/', routes);
app.use('/users', users);
app.get('/getCurrentSellOrder', function(req, res){
   redisClient.ZRANGE(sell_order_set,0,20, function(err,members){
      console.log("Sell Orders Received: " + members);
      res.send(JSON.stringify(members))
   })

});

app.get('/getCurrentBuyOrder', function(req, res){
   redisClient.ZRANGE(buy_order_set,0,20, function(err,members){
      console.log("Buy Orders Received: " + members);
      res.send(JSON.stringify(members))
   })
});

app.post("/postOrder", function(req,res){
  req.body['user_id'] = "\"" + req.user._id.toString() + "\""
  req.body['order_id'] = "\"" + Math.floor(Math.random() * Math.floor(100010)).toString() + "\"";
  //validate
  console.log(req.body)
  request.post({url:'http://127.0.0.1:5000/order', body: JSON.stringify(req.body)}, function optionalCallback(err, httpResponse, body) {
  if (err) {
    console.error('Order Failed:', err);
    res.send("Order Failed")
  } else{
    res.send("Order successfully placed")
  }
});
});

http.listen(3000, function() {
   console.log('listening on *:3000');
});
