//server
const express = require("express");
const path = require("path");
const fs = require("fs");

const key = fs.readFileSync("./certs/localhost.key");
const cert = fs.readFileSync("./certs/localhost.crt");
const app = express();
const server = require("http").createServer({ key: key, cert: cert }, app); //TODO: change to https

var io = require("socket.io")(server);
var port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

/* TODO: for http to https redirect
app.use((req, res, next) => {
  if (!req.secure) {
    return res.redirect('https://' + req.headers.host + req.url); //TODO: set for https
  }
  next();
})
*/

server.listen(port, "0.0.0.0", function () {
  console.log("listening on *:" + port);
});

//constants
const dictionary = JSON.parse(fs.readFileSync("./dictionary/dictionary.json", "utf8"));
const vowels = ["A", "E", "I", "O", "U"];
const consonants = [
  "B",
  "C",
  "D",
  "F",
  "G",
  "H",
  "J",
  "K",
  "L",
  "M",
  "N",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "V",
  "W",
  "X",
  "Y",
  "Z",
];
var letterCount = 0;
var users = [];

app.get("/", function (req, res) {
  res.sendFile(__dirname + "/public/index.html");
});

io.on("connection", function (socket) {
  //message
  socket.on("message", function (msg) {
    io.sockets
      .in(socket.roomname)
      .emit("message", socket.username + ": " + msg);
  });

  //users
  socket.on("addUser", function (values) {
    socket.username = values.username;
    socket.roomname = values.room;

    socket.join(socket.roomname);
    users.push(socket.username);

    io.sockets.in(socket.roomname).emit("userAdded", socket.username);
    io.sockets
      .in(socket.roomname)
      .emit("message", socket.username + " joined the room");
  });

  socket.on("getUsers", function () {
    io.sockets.in(socket.roomname).emit("users", users);
  });

  //remove the user
  socket.on("disconnect", () => {
    index = users.indexOf(socket.username);
    if (index > -1) {
      users.splice(index, 1);
    }

    io.sockets.in(socket.roomname).emit("removeUser", socket.username);
    io.sockets
      .in(socket.roomname)
      .emit("message", socket.username + " left the room");
  });

  // select letters event
  socket.on("selectLetter", function (type) {
    if (letterCount < 9) {
      //letterCount++;

      switch (type) {
        case "vowel":
          io.sockets
            .in(socket.roomname)
            .emit("selectLetter", selectLetter(vowels));
          break;
        case "consonant":
          io.sockets
            .in(socket.roomname)
            .emit("selectLetter", selectLetter(consonants));
          break;
      }
    }
  });

  //get users answers
  roundAnswers = [];
  socket.on("submitAnswer", function (response) {
    response.user = socket.username;
    roundAnswers.push(response);
  });

  //countdown timer
  timer = 30;
  socket.on("startTimer", (interval) => {
    let countdown = setInterval(() => {
      timer--;
      io.sockets.in(socket.roomname).emit("timer", timer);

      if (timer === 0) {
        clearInterval(countdown);
        timer = 30;
        checkAnswers(socket);
      }
    }, 1000);
  });
});

const selectLetter = (arr) => {
  return arr[Math.floor(Math.random() * arr.length)];
};

const checkAnswers = (socket) => {
  // todo: check for users who didn't submit answer and set score to 0

  roundAnswers.forEach((response) => {
    //check response.answer if is correct word
    var correctWord  = dictionary[response.answer];
    
    //set score
    if(correctWord){
      response.score = response.answer.length;
      response.definition = correctWord;
    }else{
      response.score = 0;
      response.definition = '';
    }
    
  });

  io.sockets.in(socket.roomname).emit("showAnswers", roundAnswers);
  roundAnswers = [];
};
