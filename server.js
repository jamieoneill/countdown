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
var vowels =
  "AAAAAAAAAAAAAAAEEEEEEEEEEEEEEEEEEEEEIIIIIIIIIIIIIOOOOOOOOOOOOOUUUUU";
var consonants =
  "BBCCCDDDDDDFFGGGHHJKLLLLLMMMMNNNNNNNNPPPPQRRRRRRRRRSSSSSSSSSTTTTTTTTTVWXYZ";

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
      socket.adapter.rooms[socket.roomname].scoreBoard = [];
      socket.adapter.rooms[socket.roomname].roundAnswers = [];
      socket.adapter.rooms[socket.roomname].vowels = vowels;
      socket.adapter.rooms[socket.roomname].consonants = consonants;
      socket.adapter.rooms[socket.roomname].letterCount = 0;
      socket.adapter.rooms[socket.roomname].runningTimer = false;
    }

    socket.adapter.rooms[socket.roomname].scoreBoard.push({
      id: socket.id,
      name: socket.username,
      score: 0,
      playing: true,
    });
  });

  socket.on("getUsers", () => {
    var users = [];
    for (socketID in io.nsps["/"].adapter.rooms[socket.roomname].sockets) {
      var nickname = io.nsps["/"].connected[socketID].username;
      users.push(nickname);
    }

    io.sockets.in(socket.roomname).emit("users", users);
  });

  socket.on("getScores", () => {
    scores = socket.adapter.rooms[socket.roomname].scoreBoard;

    scores.sort(function (a, b) {
      return a.score - b.score;
    });

    io.sockets.in(socket.roomname).emit("scores", scores.reverse());
  });

  //remove the user
  socket.on("disconnect", () => {
    //set to not playing if the room is still open
    if (socket.adapter.rooms[socket.roomname]) {
      scores = socket.adapter.rooms[socket.roomname].scoreBoard;

      objIndex = scores.findIndex((obj) => obj.id == socket.id);
      scores[objIndex].playing = false;
    }

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

  //startGame
  socket.on("startGame", function () {
    io.sockets.in(socket.roomname).emit("triggerGame");
  });

  socket.on("startRound", function (round) {
    //select random player to choose
    var players = socket.adapter.rooms[socket.roomname].scoreBoard.filter(
      (obj) => {
        return obj.playing === true;
      }
    );

    randomPlayer = players[Math.floor(Math.random() * players.length)];

    io.sockets
      .in(socket.roomname)
      .emit("playersRound", { round: round, name: randomPlayer.name });
  });

  // select letters event
  socket.on("selectLetter", function (type) {
    if (socket.adapter.rooms[socket.roomname].letterCount < 9) {
      socket.adapter.rooms[socket.roomname].letterCount++;

      switch (type) {
        case "vowel":
          io.sockets
            .in(socket.roomname)
            .emit("selectLetter", selectLetter(socket, "vowel"));
          break;
        case "consonant":
          io.sockets
            .in(socket.roomname)
            .emit("selectLetter", selectLetter(socket, "consonant"));
          break;
      }
    }
  });

  //get users answers
  socket.on("submitAnswer", function (response) {
    socket.adapter.rooms[socket.roomname].roundAnswers.push(response);
  });

  //countdown timer
  socket.on("startTimer", () => {
    timer = 30;
    running = socket.adapter.rooms[socket.roomname].runningTimer;

    if (!running) {
      socket.adapter.rooms[socket.roomname].runningTimer = true;

      let countdown = setInterval(() => {
        timer--;
        io.sockets.in(socket.roomname).emit("timer", timer);

        if (timer === 0) {
          clearInterval(countdown);
          timer = 30;
          running = false;
          checkAnswers(socket);
          resetRound(socket);
        }
      }, 1000);
    }
  });
});

const selectLetter = (socket, type) => {
  switch (type) {
    case "vowel":
      str = socket.adapter.rooms[socket.roomname].vowels;
      random = str[Math.floor(Math.random() * str.length)];
      socket.adapter.rooms[socket.roomname].vowels = str.replace(random, "");

      break;
    case "consonant":
      str = socket.adapter.rooms[socket.roomname].consonants;
      random = str[Math.floor(Math.random() * str.length)];
      socket.adapter.rooms[socket.roomname].consonants = str.replace(
        random,
        ""
      );
      break;
  }

  return random;
};

const checkAnswers = (socket) => {
  var roundAnswers = socket.adapter.rooms[socket.roomname].roundAnswers;

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

  io.sockets.in(socket.roomname).emit("message", "Round scores");
  io.sockets.in(socket.roomname).emit("showAnswers", roundAnswers);
  socket.adapter.rooms[socket.roomname].roundAnswers = [];
  updateScoreboard(socket, roundAnswers);
};

function updateScoreboard(socket, answers) {
  scoreBoard = socket.adapter.rooms[socket.roomname].scoreBoard;

  answers.forEach((person) => {
    objIndex = scoreBoard.findIndex((obj) => obj.user == person.name);
    scoreBoard[objIndex].score = scoreBoard[objIndex].score + person.score;
  });

  scoreBoard.sort(function (a, b) {
    return a.score - b.score;
  });

  io.sockets.in(socket.roomname).emit("scores", scoreBoard.reverse());
}

function resetRound(socket) {
  socket.adapter.rooms[socket.roomname].roundAnswers = [];
  socket.adapter.rooms[socket.roomname].vowels = vowels;
  socket.adapter.rooms[socket.roomname].consonants = consonants;
  socket.adapter.rooms[socket.roomname].letterCount = 0;
}
