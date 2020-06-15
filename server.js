//server
const express = require("express");
const path = require("path");
const fs = require("fs");
const { chain, evaluate } = require("mathjs");
const solver = require("./dictionary/cntdn.js");

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
const vowels =
  "AAAAAAAAAAAAAAAEEEEEEEEEEEEEEEEEEEEEIIIIIIIIIIIIIOOOOOOOOOOOOOUUUUU";
const consonants =
  "BBCCCDDDDDDFFGGGHHJKLLLLLMMMMNNNNNNNNPPPPQRRRRRRRRRSSSSSSSSSTTTTTTTTTVWXYZ";
const smallNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const largeNumbers = [25, 50, 75, 100];
const conundrums = JSON.parse(
  fs.readFileSync("./dictionary/conundrums.json", "utf8")
);

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
      socket.adapter.rooms[socket.roomname].started = false;
      socket.adapter.rooms[socket.roomname].scoreBoard = [];
      socket.adapter.rooms[socket.roomname].roundAnswers = [];
      socket.adapter.rooms[socket.roomname].vowels = vowels;
      socket.adapter.rooms[socket.roomname].consonants = consonants;
      socket.adapter.rooms[socket.roomname].letterCount = 0;
      socket.adapter.rooms[socket.roomname].numberCount = 0;
      socket.adapter.rooms[socket.roomname].numberToReach = 0;
      socket.adapter.rooms[socket.roomname].roundNumbers = [];
      socket.adapter.rooms[socket.roomname].conundrum = "";
      socket.adapter.rooms[socket.roomname].runningTimer = false;
      socket.adapter.rooms[socket.roomname].timer = "";
      socket.adapter.rooms[socket.roomname].currentRound = "";
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

    //don't include rooms with no host or have already started
    for (const room in rooms) {
      if (!rooms[room].host || rooms[room].started) {
        delete rooms[room];
      }
    }

    io.sockets.emit("rooms", rooms);
  });

  //startGame
  socket.on("startGame", function () {
    socket.adapter.rooms[socket.roomname].started = true;
    io.sockets.in(socket.roomname).emit("triggerGame");
  });

  socket.on("startRound", function (round) {
    socket.adapter.rooms[socket.roomname].currentRound = round;

    //select random player to choose
    var players = socket.adapter.rooms[socket.roomname].scoreBoard.filter(
      (obj) => {
        return obj.playing === true;
      }
    );

    randomPlayer = players[Math.floor(Math.random() * players.length)];

    //host controls the conundrum
    if (socket.adapter.rooms[socket.roomname].currentRound == "conundrum") {
      randomPlayer.name = socket.adapter.rooms[socket.roomname].host;
    }

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

  // select numbers event
  socket.on("selectNumber", function (type) {
    //generate numberToReach once to save on calls to server
    if (socket.adapter.rooms[socket.roomname].numberToReach == 0) {
      socket.adapter.rooms[socket.roomname].numberToReach =
        selectNumber("reach").toString() +
        selectNumber("reach").toString() +
        selectNumber("reach").toString();
    }

    if (socket.adapter.rooms[socket.roomname].numberCount < 6) {
      socket.adapter.rooms[socket.roomname].numberCount++;

      var selectedNumber = selectNumber(type);
      socket.adapter.rooms[socket.roomname].roundNumbers.push(selectedNumber);

      io.sockets
        .in(socket.roomname)
        .emit(
          "selectNumber",
          selectedNumber,
          socket.adapter.rooms[socket.roomname].numberToReach
        );
    }
  });

  // select conundrum event
  socket.on("getConundrum", function () {
    randomCon = Object.entries(conundrums)[
      Math.floor(Math.random() * Object.entries(conundrums).length)
    ];
    socket.adapter.rooms[socket.roomname].conundrum = randomCon;

    io.sockets.in(socket.roomname).emit("selectConundrum", randomCon[0]);
  });

  //get users answers
  socket.on("submitAnswer", function (response) {
    socket.adapter.rooms[socket.roomname].roundAnswers.push(response);
  });

  socket.on("checkConundrum", function (response) {
    response.correct = false;

    //pause timer
    socket.adapter.rooms[socket.roomname].runningTimer = false;

    //correct
    if (
      response.answer.toUpperCase() ==
      socket.adapter.rooms[socket.roomname].conundrum[1]
    ) {
      response.correct = true;
      updateScoreboard(socket, [{ score: 10, user: response.user }]);
      clearInterval(socket.adapter.rooms[socket.roomname].timer);
      resetRound(socket);
    }
    
    //show the guess to everyone
    io.sockets.in(socket.roomname).emit("guessedConundrum", response);
  });

  //countdown timer
  socket.on("startTimer", () => {
    timer = 30;

    if (!socket.adapter.rooms[socket.roomname].runningTimer) {
      socket.adapter.rooms[socket.roomname].runningTimer = true;

      socket.adapter.rooms[socket.roomname].timer = setInterval(() => {
        if (socket.adapter.rooms[socket.roomname].runningTimer) {
          timer--;
          io.sockets.in(socket.roomname).emit("timer", timer);
        }

        if (timer === 0) {
          clearInterval(socket.adapter.rooms[socket.roomname].timer);
          timer = 30;
          socket.adapter.rooms[socket.roomname].runningTimer = false;
          checkAnswers(socket);
          resetRound(socket);
        }
      }, 1000);
    }
  });

  socket.on("resumeTimer", function () {
    socket.adapter.rooms[socket.roomname].runningTimer = true;
  });
});

const selectNumber = (type) => {
  switch (type) {
    case "small":
      random = smallNumbers[Math.floor(Math.random() * smallNumbers.length)];
      break;
    case "large":
      random = largeNumbers[Math.floor(Math.random() * largeNumbers.length)];
      break;
    case "reach":
      random =
        smallNumbers[Math.floor(Math.random() * (smallNumbers.length - 1))];
      break;
  }

  return random;
};

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
  var bestSolution = "";

  roundAnswers.forEach((response) => {
    if (socket.adapter.rooms[socket.roomname].currentRound == "letters") {
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
    } else if (
      socket.adapter.rooms[socket.roomname].currentRound == "numbers"
    ) {
      var hasError = false;
      var sum;
      var res;

      //check each line in answer
      var lines = response.answer.split("\n");
      lines.forEach(function (line) {
        //catch multiples with x char
        if (line.includes("x")) {
          line = line.replace("x", "*");
        }

        sum = line.split("=")[0];
        res = line.split("=")[1];

        if (evaluate(sum) != res) {
          hasError = true;
        }
      });

      //set score
      if (hasError) {
        response.score = 0;
      } else {
        // res will be the last = value, which should be numberToReach //TODO: this is bad and can be cheesed, work it out better
        difference = diff(
          res,
          socket.adapter.rooms[socket.roomname].numberToReach
        );

        // 10 for reaching it exactly, 7 for being 1–5 away, 5 for being 6–10 away.
        if (difference == 0) {
          response.score = 10;
        } else if (difference > 0 && difference < 6) {
          response.score = 7;
        } else if (difference > 5 && difference < 11) {
          response.score = 5;
        } else {
          response.score = 0;
        }
      }
    }
  });

  //add best solutions
  if (socket.adapter.rooms[socket.roomname].currentRound == "letters") {
    //TODO: get best word
  } else if (socket.adapter.rooms[socket.roomname].currentRound == "numbers") {
    bestSolution = solver(
      socket.adapter.rooms[socket.roomname].roundNumbers,
      socket.adapter.rooms[socket.roomname].numberToReach
    );
  } else if (
    socket.adapter.rooms[socket.roomname].currentRound == "conundrum"
  ) {
    bestSolution = socket.adapter.rooms[socket.roomname].conundrum[1];
  }

  io.sockets.in(socket.roomname).emit("message", "Round scores");
  io.sockets
    .in(socket.roomname)
    .emit("showAnswers", roundAnswers, bestSolution);
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
  socket.adapter.rooms[socket.roomname].numberCount = 0;
  socket.adapter.rooms[socket.roomname].numberToReach = 0;
  socket.adapter.rooms[socket.roomname].roundNumbers = [];
  socket.adapter.rooms[socket.roomname].conundrum = "";
  socket.adapter.rooms[socket.roomname].runningTimer = false;
  socket.adapter.rooms[socket.roomname].timer = "";
  socket.adapter.rooms[socket.roomname].currentRound = "";
}

function diff(a, b) {
  return Math.abs(a - b);
}
