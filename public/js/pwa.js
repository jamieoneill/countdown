$(function () {
  /* PWA FUNCTIONS */
  //load service workers for PWA
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((registration) => {
        //todo: remove logging when on server
        console.log(
          "ServiceWorker registration successful with scope: ",
          registration.scope
        );
      })
      .catch((err) => {
        // registration failed
        console.log("ServiceWorker registration failed: ", err);
      });
  }
  /* END PWA FUNCTIONS */

  var socket = io.connect();
  var username;
  var room;
  var roundLetters = { letters: [], counts: {} };

  //add as user to room
  //username = setUserName();
  roomValues = joinRoom();
  username = roomValues[0];
  room = roomValues[1];

  //get new users
  socket.on("userAdded", function (user) {
    $("#users").append($("<li>").text(user));
  });

  //remove user
  socket.on("removeUser", function (user) {
    $("#users").append($("<li>").text(user));
    $("li:contains('" + user + "')").remove();
  });

  //request letter
  $(".letterButton").click(function (e) {
    socket.emit("selectLetter", e.target.id);
  });

  //receive letter
  socket.on("selectLetter", function (letter) {
    $("#letterHolder").append($("<span>").text(letter));
    roundLetters.letters.push(letter);

    //start countdown when all letters are selected
    if ($("#letterHolder")[0].innerText.length == 9) {
      //add counts for each letter
      var count = {};
      roundLetters.letters.forEach(function (i) {
        count[i] = (count[i] || 0) + 1;
      });
      roundLetters.counts = count;

      alert("countdown");

      socket.emit("startTimer", 30);
      $(".letterButton").prop("disabled", true);
    }
  });

  //check answer for errors before submit
  $("#answer").keyup(function (e) {
    let strToArr = $("#answer").val().toUpperCase().split("");
    let hasError = false;
    let errorTitle = "";

    //check if answer has unavailable  letter
    strToArr.forEach((letter) => {
      if (
        roundLetters.letters.length != 0 &&
        !roundLetters.letters.includes(letter)
      ) {
        hasError = true;
        errorTitle = "'" + letter + "' is not a valid letter";
      }
    });

    //check for duplicate letters
    var letterCount = {};
    strToArr.forEach((i) => {
      letterCount[i] = (letterCount[i] || 0) + 1;
    });

    for (let letter in roundLetters.counts) {
      if (letterCount[letter]) {
        if (letterCount[letter] > roundLetters.counts[letter]) {
          hasError = true;
          errorTitle = "You have used too many '" + letter + "' letters";
        }
      }
    }

    if (hasError) {
      $("#answer").attr("title", errorTitle);
      $("#answer").tooltip("show");
      $("#submitAnswer").prop("disabled", true);
    } else {
      $("#answer").tooltip("dispose");
      $("#submitAnswer").prop("disabled", false);

      if (e.originalEvent.key === "Enter") {
        submitAnswer();
      }
    }
  });

  $("#submitAnswer").click(function (e) {
    submitAnswer();
  });

  //submit answer
  function submitAnswer() {
    socket.emit("submitAnswer", {
      answer: $("#answer").val(),
      user: username,
    });

    $("#answer").prop("disabled", true);
    $("#submitAnswer").prop("disabled", true);
  }

  //timer
  socket.on("timer", function (timeLeft) {
    $("#timer").text(timeLeft);

    if (timeLeft === 0) {
      alert("time's up!");
      $("#answer").prop("disabled", true);
      $("#submitAnswer").prop("disabled", true);
    }
  });

  test = {"one": "1", "two": "2"}
  
  console.log(test["one"])
  //get answers
  socket.on("showAnswers", function (responses) {
    responses.forEach((response) => {
      console.log(response)
      $("#messages").append(
        $("<li>").text(
          response.user + " : " + response.answer + " : " + response.score
        )
      );
    });
  });

  //server messages
  socket.on("message", function (msg) {
    //add bold for messages from the server
    if (!msg.includes(":")) {
      $("#messages").append($("<li>").append($("<b>").text(msg)));
    } else {
      $("#messages").append($("<li>").text(msg));
    }
    $("#messages").scrollTop($("#messages")[0].scrollHeight);
  });

  //send message
  $("#inputMessage").keyup(function (e) {
    if (e.keyCode === 13) {
      socket.emit("message", $("#inputMessage").val());
      $("#inputMessage").val("");
    }
  });

  // OTHER FUNCTIONS
  //get username
  async function setUserName() {
    const { value: name } = await Swal.fire({
      title: "Enter your name",
      input: "text",
      allowOutsideClick: false,
      inputValidator: (value) => {
        if (!value) {
          return "You need to write something!";
        }
      },
    });

    if (name) {
      socket.emit("addUser", name);
    }

    return name;
  }

  async function joinRoom() {
    results = {};

    await Swal.mixin({
      input: "text",
      confirmButtonText: "Next &rarr;",
      allowOutsideClick: false,
      showCancelButton: false,
      progressSteps: ["1", "2"],
    })
      .queue([
        {
          title: "Username",
          text: "Enter your name",
          inputValidator: (value) => {
            if (!value) {
              return "You need to enter a name";
            }
          },
        },
        {
          title: "Room",
          text: "Enter a room name",
          confirmButtonText: "Enter Room",
        },
      ])
      .then((result) => {
        if (result.value) {
          results.username = result.value[0];
          results.room = result.value[1];

          socket.emit("addUser", results);

          //get current users
          retrievedUsers = false;
          socket.emit("getUsers");

          //only get once
          socket.on("users", function (users) {
            if (!retrievedUsers) {
              retrievedUsers = true;
              users.pop();

              users.forEach((user) => {
                $("#users").append($("<li>").text(user));
              });
            }
          });
        } else {
          console.log("this should never happen");
          console.log(result);
        }
      });

    return results;
  }
}); //end main
