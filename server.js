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
const dictionary = JSON.parse(
  fs.readFileSync("./dictionary/dictionary.json", "utf8")
);
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
///var vowels = "AAAAAAAAAAAAAAAEEEEEEEEEEEEEEEEEEEEEIIIIIIIIIIIIIOOOOOOOOOOOOOUUUUU"; //todo: set as values, because random doesn't give nice letters
//var consonants = "BBCCCDDDDDDFFGGGHHJKLLLLLMMMMNNNNNNNNPPPPQRRRRRRRRRSSSSSSSSSTTTTTTTTTVWXYZ";

var letterCount = 0;

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

    //check for password
    if (io.nsps["/"].adapter.rooms[socket.roomname]) {
      console.log("there is a room");
      if (io.nsps["/"].adapter.rooms[socket.roomname].password != "") {
        if (
          socket.adapter.rooms[socket.roomname].password === values.password
        ) {
          // join private game
          socket.join(socket.roomname);
        } else {
          // wrong password
          io.sockets.connected[socket.id].emit(
            "wrongPassword",
            socket.roomname
          );
          return;
        }
      } else {
        //no password just join
        socket.join(socket.roomname);
      }
    } else {
      //no room create it
      socket.join(socket.roomname);
    }

    io.sockets.in(socket.roomname).emit("userAdded", socket.username);
    io.sockets
      .in(socket.roomname)
      .emit("message", socket.username + " joined the room");

    //set room values when hosting
    if (!socket.adapter.rooms[socket.roomname].host) {
      socket.adapter.rooms[socket.roomname].host = socket.username;
      socket.adapter.rooms[socket.roomname].type = values.type;
      socket.adapter.rooms[socket.roomname].open = values.open;
      socket.adapter.rooms[socket.roomname].password = values.password;
    }
  });

  socket.on("getUsers", function () {
    var users = [];
    for (socketID in io.nsps["/"].adapter.rooms[socket.roomname].sockets) {
      var nickname = io.nsps["/"].connected[socketID].username;
      users.push(nickname);
    }

    io.sockets.in(socket.roomname).emit("users", users);
  });

  //remove the user
  socket.on("disconnect", () => {
    io.sockets.in(socket.roomname).emit("removeUser", socket.username);
    io.sockets
      .in(socket.roomname)
      .emit("message", socket.username + " left the room");
  });

  //rooms
  socket.on("getRooms", function () {
    rooms = socket.adapter.rooms;

    //don't include rooms with no host
    for (const room in rooms) {
      if (!rooms[room].host) {
        delete rooms[room];
      }
    }

    io.sockets.emit("rooms", rooms);
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

function shuffle(str) {
  return str
    .split("")
    .sort(function () {
      return 0.5 - Math.random();
    })
    .join("");
}
const checkAnswers = (socket) => {
  // todo: check for users who didn't submit answer and set score to 0

  roundAnswers.forEach((response) => {
    //check response.answer if is correct word
    var correctWord = dictionary[response.answer];

    //set score
    if (correctWord) {
      response.score = response.answer.length;
      response.definition = correctWord;
    } else {
      response.score = 0;
      response.definition = "";
    }
  });

  io.sockets.in(socket.roomname).emit("showAnswers", roundAnswers);
  roundAnswers = [];
};
