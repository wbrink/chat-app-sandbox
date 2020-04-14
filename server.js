// Requiring necessary npm packages
var express = require("express");
var app = express();
var http = require("http").Server(app);
var io = require("socket.io")(http);

var session = require("express-session");
// Requiring passport as we've configured it
var passport = require("./config/passport");
const exphbs = require("express-handlebars");

// Setting up port and requiring models for syncing
var PORT = process.env.PORT || 8080;
var db = require("./models");

app.use(express.static("public"));

// what persistent memory we are going to store our session in. by default express-session uses its own implementation using local memory not good for production and can cause memory leaks
// you need to connect database to express session middleware. there are stores for most database implementations
var SequelizeStore = require("connect-session-sequelize")(session.Store);
var myStore = new SequelizeStore({
  db: db.sequelize
});

// We need to use sessions to keep track of our user's login status
app.use(
  session({
    secret: "keyboard cat",
    store: myStore, // session store object is using
    resave: true,
    saveUninitialized: true,
    cookie: {
      // setting httpOnly: true and secure: true will help avoid session hijacking
      httpOnly: true, // this is the defualt value
      secure: false // this should be true if there is going to be an https connection // the cookie will not be sent if secure: true and the site is accessed over http not https
    }
  })
);
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(passport.initialize());
app.use(passport.session());

//setup express handlebars
app.engine("handlebars", exphbs({ defaultLayout: "main" }));
app.set("view engine", "handlebars");

// Requiring our routes
const htmlRoutes = require("./routes/html-routes");
app.use(htmlRoutes);

//////////////////////////////////////////////
/////////////// socket.io/////////////////////

io.on("connection", function(socket) {
  console.log("a user connected");

  // webrtc 2 people functionality
  socket.on("create or join", function(room) {
    console.log("create or join to room ", room);

    var myRoom = io.sockets.adapter.rooms[room] || { length: 0 };
    var numClients = myRoom.length;
    console.log(myRoom);

    console.log(room, " has ", numClients, " clients");

    if (numClients == 1) {
      //socket.join(room);
      console.log('here');
      socket.emit("created", room);
    } else if (numClients == 2) {
      //socket.join(room);
      socket.emit("joined", room);
    } else {
      socket.emit("full", room);
    }
  });

  socket.on("ready", function(room) {
    socket.broadcast.to(room).emit("ready");
  });

  socket.on("candidate", function(event) {
    socket.broadcast.to(event.room).emit("candidate", event);
  });

  socket.on("offer", function(event) {
    socket.broadcast.to(event.room).emit("offer", event.sdp);
  });

  socket.on("answer", function(event) {
    socket.broadcast.to(event.room).emit("answer", event.sdp);
  });

  // socket.on("disconnect", function(event) {
  //   console.log("user left");
  // });


  socket.on("join chat", async function(obj) {
    socket.join(obj.room); // join the room
    
    const user = await db.Chat.findAll({where: {room: obj.room, user: obj.user}}); // this means the user just updated the page checking if the user just updated the page
    if (user.length <= 0){
      await db.Chat.create({room: obj.room, user: obj.user});
    }
    
    socket.user = obj.user;
    socket.room = obj.room;
    console.log(`${socket.user} joined`)
    io.to(obj.room).emit("joined chat", {user: obj.user}) // sends 
    
    const users = await db.Chat.findAll({attributes: ['user']}, {where: {room: obj.room}});
    console.log(JSON.stringify(users));
    const connected = users.map(elem => elem.user)
    
    io.to(obj.room).emit("users in room", connected); // send to everyone when user joins
  })

  
  socket.on("chat message", function(obj) {
    // send to all clients except sender
    socket.to(obj.room).broadcast.emit("chat message", obj); //sends object
    // console.log(obj);
  })

  // each socket has disconnect event
  socket.on("disconnect", async () => {
    // otherwise it will say undefined disconnected
    if (!socket.user) {
      return;
    }
    // remove user from array
    await db.Chat.destroy({
      where: {
        user: socket.user
      }
    });
    
    const users = await db.Chat.findAll({attributes: ['user']}, {where: {room: socket.room}});
    console.log(JSON.stringify(users));
    const connected = users.map(elem => elem.user)
    
    io.to(socket.room).emit("users in room", connected);
    
    console.log(`${socket.user} disconnected`);
    socket.to(socket.room).broadcast.emit("user disconnected", {user: socket.user}); // sends string
  })

});
// webrtc 2 people functionality

//////////////////////////////////////////////
/////////////// socket.io/////////////////////

// Syncing our database and logging a message to the user upon success
// handling socket.io
db.sequelize.sync().then(function() {
  http.listen(PORT, function() {
    console.log(
      "==> 🌎  Listening on port %s. Visit http://localhost:%s/ in your browser.",
      PORT,
      PORT
    );
  });
});
