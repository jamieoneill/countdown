//server
const express = require("express");
const path = require("path");
const fs = require("fs");
const { chain, evaluate } = require("mathjs");
const solver = require("./dictionary/cntdn.js");
const app = express();
const server = require("http").createServer(app);

var io = require("socket.io")(server);
var port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

app.use((req, res, next) => {
  if (!req.secure) {
    return res.redirect("https://" + req.headers.host + req.url);
  }
  next();
});

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

    if (socket.adapter.rooms[socket.roomname]) {
      //check if game has started
      if (socket.adapter.rooms[socket.roomname].started) {
        io.sockets.connected[socket.id].emit("gameInProgress", socket.roomname);
        return;
      }
      //check for password
      if (socket.adapter.rooms[socket.roomname].password != "") {
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

    //set the rounds
    var roundOrder;
    var removeAt;
    switch (values.rounds) {
      case "5":
        roundOrder = ["letters", "letters", "letters", "numbers", "conundrum"];
        removeAt = 2;
        break;
      case "10":
        roundOrder = [
          "letters",
          "letters",
          "numbers",
          "letters",
          "letters",
          "numbers",
          "letters",
          "letters",
          "numbers",
          "conundrum",
        ];
        removeAt = 3;
        break;
      case "15":
        roundOrder = [
          "letters",
          "letters",
          "letters",
          "numbers",
          "numbers",
          "letters",
          "letters",
          "letters",
          "numbers",
          "numbers",
          "letters",
          "letters",
          "numbers",
          "numbers",
          "conundrum",
        ];
        removeAt = 4;
        break;
    }

    io.sockets.in(socket.roomname).emit("userAdded", socket.username);
    io.sockets
      .in(socket.roomname)
      .emit("message", socket.username + " joined the room");

    //set room values when hosting
    if (!socket.adapter.rooms[socket.roomname].host) {
      socket.adapter.rooms[socket.roomname].host = socket.username;
      socket.adapter.rooms[socket.roomname].type = values.type;
      socket.adapter.rooms[socket.roomname].removeAtRound = removeAt;
      socket.adapter.rooms[socket.roomname].rounds = roundOrder;
      socket.adapter.rooms[socket.roomname].roundTime = values.time;
      socket.adapter.rooms[socket.roomname].open = values.open;
      socket.adapter.rooms[socket.roomname].password = values.password;
      socket.adapter.rooms[socket.roomname].started = false;
      socket.adapter.rooms[socket.roomname].scoreBoard = [];
      socket.adapter.rooms[socket.roomname].roundAnswers = [];
      socket.adapter.rooms[socket.roomname].selectingPlayer = "";
      socket.adapter.rooms[socket.roomname].vowels = vowels;
      socket.adapter.rooms[socket.roomname].consonants = consonants;
      socket.adapter.rooms[socket.roomname].roundLetters = "";
      socket.adapter.rooms[socket.roomname].roundBestWord = "";
      socket.adapter.rooms[socket.roomname].letterCount = 0;
      socket.adapter.rooms[socket.roomname].numberCount = 0;
      socket.adapter.rooms[socket.roomname].numberToReach = 0;
      socket.adapter.rooms[socket.roomname].roundNumbers = [];
      socket.adapter.rooms[socket.roomname].conundrum = "";
      socket.adapter.rooms[socket.roomname].runningTimer = false;
      socket.adapter.rooms[socket.roomname].timer = "";
      socket.adapter.rooms[socket.roomname].currentRound = {
        name: "",
        number: 0,
      };
    }

    socket.adapter.rooms[socket.roomname].scoreBoard.push({
      id: socket.id,
      name: socket.username,
      roundScores: [],
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
    removeUserFromRoom(socket);
  });

  //leave room
  socket.on("leaveRoom", function () {
    socket.leave(socket.roomname);

    removeUserFromRoom(socket);
  });

  //rooms
  socket.on("getRooms", function () {
    var rooms = Object.assign({}, socket.adapter.rooms);

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
    io.sockets.in(socket.roomname).emit("triggerGame", {
      order: socket.adapter.rooms[socket.roomname].rounds,
      timer: socket.adapter.rooms[socket.roomname].roundTime,
    });
  });

  socket.on("startRound", function (round) {
    socket.adapter.rooms[socket.roomname].currentRound.name = round;
    socket.adapter.rooms[socket.roomname].currentRound.number++;

    //select random player to choose
    var players = getPlayersInGame(socket);
    randomPlayer = players[Math.floor(Math.random() * players.length)];

    //host controls the conundrum
    if (
      socket.adapter.rooms[socket.roomname].currentRound.name == "conundrum"
    ) {
      randomPlayer.name = socket.adapter.rooms[socket.roomname].host;
    }

    socket.adapter.rooms[socket.roomname].selectingPlayer = randomPlayer.name;

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

    //solving the best word can take a few seconds so do it while players are guessing
    if (socket.adapter.rooms[socket.roomname].letterCount == 9) {
      var solutions = [];
      solver.solve_letters(
        socket.adapter.rooms[socket.roomname].roundLetters.toLowerCase(),
        dictionary,
        function (word, def) {
          solutions.push([word, def]);
        }
      );

      socket.adapter.rooms[socket.roomname].roundBestWord = solutions.reduce(
        function (a, b) {
          return a[0].length > b[0].length ? a : b;
        }
      );
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
    } else {
      updateScoreboard(socket, [{ score: 0, user: response.user }]);
    }

    //show the guess to everyone
    io.sockets.in(socket.roomname).emit("guessedConundrum", response);
  });

  //countdown timer
  socket.on("startTimer", (interval) => {
    if (!socket.adapter.rooms[socket.roomname].runningTimer) {
      socket.adapter.rooms[socket.roomname].runningTimer = true;

      socket.adapter.rooms[socket.roomname].timer = setInterval(() => {
        try {
          if (socket.adapter.rooms[socket.roomname].runningTimer) {
            interval--;
            io.sockets.in(socket.roomname).emit("timer", interval);
          }

          if (interval === 0) {
            clearInterval(socket.adapter.rooms[socket.roomname].timer);
            socket.adapter.rooms[socket.roomname].runningTimer = false;
            checkAnswers(socket);

            if (socket.adapter.rooms[socket.roomname].type == "Knockout") {
              var removeAtRound =
                socket.adapter.rooms[socket.roomname].removeAtRound;
              var removeNow =
                socket.adapter.rooms[socket.roomname].currentRound.number %
                removeAtRound;

              //knockout players at removeAtRound
              if (removeNow == 0) {
                var noOfPlayers =
                  socket.adapter.rooms[socket.roomname].scoreBoard.length;
                var numberOfRounds =
                  socket.adapter.rooms[socket.roomname].rounds.length;

                var playersStillInGame = getPlayersInGame(socket);

                playersStillInGame.sort(function (a, b) {
                  return a.score - b.score;
                });

                playersToRemove = Math.floor(
                  Math.floor(noOfPlayers / numberOfRounds) * removeAtRound
                );

                for (var i = 0; i < playersToRemove; i++) {
                  playersStillInGame[i].playing = false;

                  //tell the player they have been knocked out
                  io.sockets.connected[playersStillInGame[i].id].emit(
                    "knockedOut"
                  );
                }
              }
            }

            resetRound(socket);
          }
        } catch {
          //Room must be closed
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

  socket.adapter.rooms[socket.roomname].roundLetters += random;

  return random;
};

const checkAnswers = (socket) => {
  var roundAnswers = socket.adapter.rooms[socket.roomname].roundAnswers;
  var bestSolution = "";

  roundAnswers.forEach((response) => {
    if (socket.adapter.rooms[socket.roomname].currentRound.name == "letters") {
      //check response.answer if is correct word
      var correctWord = dictionary[response.answer];
      //set score
      if (correctWord) {
        if (response.answer.length == 9) {
          response.score = 18;
        } else {
          response.score = response.answer.length;
        }
        response.definition = correctWord;
      } else {
        response.score = 0;
        response.definition = "";
      }
    } else if (
      socket.adapter.rooms[socket.roomname].currentRound.name == "numbers"
    ) {
      var hasError = false;
      var sum;
      var res;

      //check each line in answer
      var lines = response.answer.split("\n");
      lines.forEach(function (line) {
        //catch multiples with x char
        if (line.includes("x")) {
          line = line.replace(/x/g, "*");
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
        // TODO : "Only the contestant whose result is closer to the target number scores points"... not sure to implement this as scores would be very low for multiplayer games
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
  if (socket.adapter.rooms[socket.roomname].currentRound.name == "letters") {
    bestSolution = socket.adapter.rooms[socket.roomname].roundBestWord;
  } else if (
    socket.adapter.rooms[socket.roomname].currentRound.name == "numbers"
  ) {
    bestSolution = solver.solve_numbers(
      socket.adapter.rooms[socket.roomname].roundNumbers,
      socket.adapter.rooms[socket.roomname].numberToReach
    );
  } else if (
    socket.adapter.rooms[socket.roomname].currentRound.name == "conundrum"
  ) {
    bestSolution = socket.adapter.rooms[socket.roomname].conundrum[1];
  }

  io.sockets
    .in(socket.roomname)
    .emit("showAnswers", roundAnswers, bestSolution);
  updateScoreboard(socket, roundAnswers);
};

function updateScoreboard(socket, answers) {
  scoreBoard = socket.adapter.rooms[socket.roomname].scoreBoard;

  answers.forEach((person) => {
    objIndex = scoreBoard.findIndex((obj) => obj.name == person.user);
    scoreBoard[objIndex].roundScores.push({
      round: socket.adapter.rooms[socket.roomname].currentRound.number,
      score: person.score,
    });
    scoreBoard[objIndex].score = scoreBoard[objIndex].score + person.score;
  });

  scoreBoard.sort(function (a, b) {
    return a.score - b.score;
  });

  io.sockets.in(socket.roomname).emit("scores", scoreBoard.reverse());
}

function getPlayersInGame(socket) {
  var playersStillInGame = socket.adapter.rooms[
    socket.roomname
  ].scoreBoard.filter((obj) => {
    return obj.playing === true;
  });

  return playersStillInGame;
}

function resetRound(socket) {
  socket.adapter.rooms[socket.roomname].roundAnswers = [];
  socket.adapter.rooms[socket.roomname].roundLetters = "";
  socket.adapter.rooms[socket.roomname].roundBestWord = "";
  socket.adapter.rooms[socket.roomname].letterCount = 0;
  socket.adapter.rooms[socket.roomname].numberCount = 0;
  socket.adapter.rooms[socket.roomname].numberToReach = 0;
  socket.adapter.rooms[socket.roomname].roundNumbers = [];
  socket.adapter.rooms[socket.roomname].conundrum = "";
  socket.adapter.rooms[socket.roomname].runningTimer = false;
  socket.adapter.rooms[socket.roomname].timer = "";
  socket.adapter.rooms[socket.roomname].currentRound.name = "";
}

function diff(a, b) {
  return Math.abs(a - b);
}

function removeUserFromRoom(socket) {
  //set to not playing if the room is still open
  if (socket.adapter.rooms[socket.roomname]) {
    scores = socket.adapter.rooms[socket.roomname].scoreBoard;

    objIndex = scores.findIndex((obj) => obj.id == socket.id);
    scores[objIndex].playing = false;

    //set new host
    if (socket.adapter.rooms[socket.roomname].host == socket.username) {
      var player = getPlayersInGame(socket);
      socket.adapter.rooms[socket.roomname].host = player[0].name;

      io.sockets.connected[player[0].id].emit("newHost");
    }

    //set new selecting player
    if (
      socket.adapter.rooms[socket.roomname].selectingPlayer == socket.username
    ) {
      var player = getPlayersInGame(socket);
      socket.adapter.rooms[socket.roomname].host = player[0].name;

      socket.adapter.rooms[socket.roomname].selectingPlayer = player[0].name;

      io.sockets.in(socket.roomname).emit("playersRound", {
        round: socket.adapter.rooms[socket.roomname].currentRound.name,
        name: player[0].name,
      });
    }
  }

  io.sockets.in(socket.roomname).emit("removeUser", socket.username);
  io.sockets
    .in(socket.roomname)
    .emit("message", socket.username + " left the room");
}
