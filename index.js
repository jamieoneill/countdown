//server
var app = require("express")();
var http = require("http").Server(app);
var io = require("socket.io")(http);
var port = process.env.PORT || 3000;

//constants
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
  res.sendFile(__dirname + "/index.html");
});

io.on("connection", function (socket) {
  socket.on("message", function (msg) {
    io.emit("message", socket.username  + ": " + msg);
  });

  //users
  socket.on("addUser", function (user) {
    socket.username = user;
    users.push(user);
    io.emit("userAdded", user);
    io.emit("message", user + " joined the room");
  });

  socket.on("getUsers", function () {
    io.emit("users", users);
  });

  //remove the user
  socket.on("disconnect", () => {

    index = users.indexOf(socket.username);
    if (index > -1) {
      users.splice(index, 1);
    }

    io.emit("removeUser",  socket.username);
    io.emit("message", socket.username + " left the room");
  });

  // select letters event
  socket.on("selectLetter", function (type) {
    if (letterCount < 9) {
      //letterCount++;

      switch (type) {
        case "vowel":
          io.emit("selectLetter", selectLetter(vowels));
          break;
        case "consonant":
          io.emit("selectLetter", selectLetter(consonants));
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
      socket.emit("timer", timer);

      if (timer === 0) {
        clearInterval(countdown);
        timer = 30;
        checkAnswers();
      }
    }, 1000);
  });
});

http.listen(port, "0.0.0.0", function () {
  console.log("listening on *:" + port);
});

const selectLetter = (arr) => {
  return arr[Math.floor(Math.random() * arr.length)];
};

const checkAnswers = () => {
  roundAnswers.forEach((response) => {
    // check response.answer if is correct word
    /*
    if(correctWord){
      response.score = response.answer.length;
    }else{
      response.score = 0;
    }
    */
    response.score = response.answer.length;
  });

  io.emit("showAnswers", roundAnswers);
  roundAnswers = [];
};
