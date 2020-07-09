$(function () {
  /* PWA FUNCTIONS */
  //load service workers for PWA
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/service-worker.js");
  }

  var isOnline;
  if (document.readyState !== "loading") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      init();
    });
  }

  function init() {
    if (!navigator.onLine) {
      isOnline = false;
      showOffline();
    } else {
      isOnline = true;
    }
  }

  window.addEventListener("online", handleConnection);
  window.addEventListener("offline", handleConnection);

  function handleConnection() {
    if (navigator.onLine) {
      isReachable(window.location.origin).then(function (online) {
        if (online) {
          //coming back online, close connection message
          if (!isOnline) {
            Swal.close();
          }
          isOnline = true;
          roomSelected = false;
          getUserName();
        } else {
          isOnline = false;
        }
      });
    } else {
      isOnline = false;
      showOffline();
    }
  }

  function isReachable(url) {
    return fetch(url, { method: "HEAD", mode: "no-cors" })
      .then(function (resp) {
        return resp && (resp.ok || resp.type === "opaque");
      })
      .catch(function (err) {
        console.warn("[conn test failure]:", err);
      });
  }
  /* END PWA FUNCTIONS */
  //initial view
  $("#startGame").prop("disabled", true);

  $("#info").on("click", function () {
    Swal.fire({
      title: "Information",
      html: $("#information").html().replace("display:none", ""),
      width: 800,
      showConfirmButton: true,
      showCancelButton: false,
    });
  });

  $("#exit").on("click", function () {
    Swal.fire({
      title: "Exit Room",
      html: "Are you sure you want to leave the game?",
      icon: "question",
      showCancelButton: true,
    }).then((result) => {
      if (result.value) {
        //disconnect from room
        socket.emit("leaveRoom");

        //clear old values
        $("#scores").empty();
        $("#messages").empty();
        $("#users").empty();
        $("#roundHolder").hide();
        $("#startGameScreen").show();
        document.querySelector(".room-title").innerHTML = "";

        roomSelected = false;
        joinRoom();
      }
    });
  });

  $(".sidebarCollapse").on("click", function (e) {
    if (e.currentTarget.id != "info" && e.currentTarget.id != "exit") {
      $("#sidebar").toggleClass("active");
      $("#notification").text("");
    }
  });

  var socket = io.connect();
  var username;
  var host;
  var stillPlaying = true;
  var shownKnockOut = false;
  var roomSelected = false;
  var roundOrder;
  var roundTimer;
  var roundNumber = 0;
  var currentRound;
  var roundLetters = { letters: [], counts: {}, types: [] };

  //rounds
  $("#startGame").click(function (e) {
    socket.emit("startGame");
  });

  function setRound(round) {
    currentRound = round;
    roundLetters.letters = [];
    roundLetters.types = [];

    clearFields();

    switch (round) {
      case "letters":
        $("#selectNumberButtons").hide();
        $("#selectLetterButtons").show();
        $("#selectConundrumButtons").hide();
        $("#numberHolder").hide();
        $("#answerLetter").show();
        $("#answerNumber").hide();

        for (i = 0; i < 9; i++) {
          $("#letterHolder").append($("<span>"));
        }
        break;
      case "numbers":
        $("#selectNumberButtons").show();
        $("#selectLetterButtons").hide();
        $("#selectConundrumButtons").hide();
        $("#numberHolder").show();
        $("#answerLetter").hide();
        $("#answerNumber").show();

        for (i = 0; i < 3; i++) {
          $("#numberHolder").append($("<span>"));
        }
        for (i = 0; i < 6; i++) {
          $("#letterHolder").append($("<span>"));
        }
        break;
      case "conundrum":
        $("#selectNumberButtons").hide();
        $("#selectLetterButtons").hide();
        $("#selectConundrumButtons").show();
        $("#numberHolder").hide();
        $("#answerLetter").show();
        $("#answerNumber").hide();

        for (i = 0; i < 9; i++) {
          $("#letterHolder").append($("<span>"));
        }
        break;
    }

    if (!stillPlaying) {
      if (!shownKnockOut) {
        var text = "";
        if (host) {
          text =
            "You have been knocked out of the game. You are acting as the host of this game. DO NOT CLOSE OR REFRESH THE PAGE to allow other players to keep playing.";
        } else {
          text =
            "You have been knocked out of the game. You can still watch the game without playing or refresh the page to join a new game.";
        }

        shownKnockOut = true;
        swal.fire("Knocked Out!", text, "warning");
      }

      $("#answerLetter").prop("disabled", true);
      $("#answerNumber").prop("disabled", true);
      $("#submitAnswer").prop("disabled", true);
    }

    if (host) {
      socket.emit("startRound", round);
    }
  }

  function clearFields() {
    $("#base-timer-label").text(roundTimer);
    $("#base-timer-path-remaining").removeClass("red").addClass("green");
    $("#letterHolder").empty();
    $("#numberHolder").empty();
    $(".letterButton").prop("disabled", false);
    $(".letterButton").hide();
    $(".numberButton").hide();
    $(".conundrumButton").hide();
    $("#roughWork").val("");
    $("#answerLetter").val("");
    $("#answerNumber").val("");
    $("#answerLetter").prop("disabled", false);
    $("#answerNumber").prop("disabled", false);
    $("#submitAnswer").prop("disabled", false);
    /*
    canvas = document.getElementById("whiteboard");
    context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    */
  }

  //set username
  if (isOnline) {
    getUserName();
  }

  //get new users
  socket.on("userAdded", function (user) {
    $("#users").append(
      $('<li style="color:' + user.color + '">').text(user.name)
    );
  });

  //remove user
  socket.on("removeUser", function (user) {
    $("#users").append($("<li>").text(user));
    $("#users li:contains('" + user + "')").remove();
  });

  socket.on("scores", function (scoreboard) {
    $("#scores").empty();
    var pos = 1;
    var style = "";

    scoreboard.forEach((user) => {
      if (!user.playing) {
        style = "background: #f56964;";
      }

      $("#scores").append(
        $('<li class="scoreHolder" style="' + style + '">').html(
          '<span class="scoreText">' +
            user.name +
            '</span><span  class="scoreText">' +
            user.score +
            "</span>"
        )
      );
    });

    //final scoreboard
    if (!roundOrder[roundNumber]) {
      //header
      for (i = 1; i < roundOrder.length + 1; i++) {
        $("#endGameScores > thead tr").append("<th>" + i + "</th>");
      }
      $("#endGameScores > thead tr").append("<th>Total</th>");

      //rows
      scoreboard.forEach((user) => {
        html = "<tr>";
        html += '<th scope="row">' + pos + "</th>";
        html +=
          '<td style = "font-weight: bold">' +
          user.name.toUpperCase() +
          "</td>";

        rowCount = 1;
        for (i = 1; i < roundOrder.length + 1; i++) {
          var foundThisRound;
          foundThisRound = user.roundScores.find(function (r) {
            return r.round == i;
          });

          if (foundThisRound) {
            html += "<td>" + foundThisRound.score + "</td>";
          } else {
            //didn't submit answer for this round
            html += "<td>-</td>";
          }
        }

        //user didn't guess the conundrum account for that score
        if (
          user.roundScores.length == 4 ||
          user.roundScores.length == 9 ||
          user.roundScores.length == 14
        ) {
          html += "<td>-</td>";
        }

        html += "<td>" + user.score + "</td>";
        html += "</tr>";

        $("#endGameScores > tbody:last-child").append(html);
        pos++;
      });
    }
  });

  socket.on("triggerGame", function (roundVars) {
    $("#startGameScreen").hide();
    $("#roundHolder").show();

    roundOrder = roundVars.order;
    roundTimer = roundVars.timer;

    socket.emit("getScores");
    setRound(roundOrder[roundNumber]);
  });

  socket.on("playersRound", function (roundObj) {
    $("#roundUpdate").html(
      roundObj.name + " is selecting " + roundObj.round + "..."
    );

    //only this user can select
    if (username == roundObj.name) {
      Toast.fire({
        title: "Your Turn",
      });

      switch (roundObj.round) {
        case "letters":
          $(".letterButton").show();
          break;
        case "numbers":
          $(".numberButton").show();
          break;
        case "conundrum":
          $(".conundrumButton").show();
          break;
      }
    }
  });

  //request letter
  $(".letterButton").click(function (e) {
    roundLetters.types.push(e.target.id);

    var numOfVowel = roundLetters.types.filter(function (x) {
      return x === "vowel";
    }).length;
    var numOfConsonant = roundLetters.types.filter(function (x) {
      return x === "consonant";
    }).length;

    //must have at least 3 vowels and 4 consonants
    if (numOfVowel == 5) {
      $("#vowel").prop("disabled", true);
    }
    if (numOfConsonant == 6) {
      $("#consonant").prop("disabled", true);
    }

    socket.emit("selectLetter", e.target.id);
  });

  //receive letter
  socket.on("selectLetter", function (letter) {
    $("#letterHolder").find("span:empty:first").text(letter);
    roundLetters.letters.push(letter);

    //start countdown when all letters are selected
    if ($("#letterHolder").find("span:last").text() != "") {
      //add counts for each letter
      var count = {};
      roundLetters.letters.forEach(function (i) {
        count[i] = (count[i] || 0) + 1;
      });
      roundLetters.counts = count;

      Toast.fire({
        title: "Countdown!",
      });
      $("#roundUpdate").html("Enter your word...");

      socket.emit("startTimer", roundTimer);
      $(".letterButton").hide();
    }
  });

  //check answer for errors before submit
  $("#answerLetter").keyup(function (e) {
    let strToArr = $("#answerLetter").val().toUpperCase().split("");
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
      $("#answerLetter").attr("title", errorTitle);
      $("#answerLetter").tooltip({
        container: ".wrapper",
      });
      $("#answerLetter").tooltip("show");
      $("#submitAnswer").prop("disabled", true);
    } else {
      $("#answerLetter").tooltip("dispose");
      $("#submitAnswer").prop("disabled", false);

      if (e.originalEvent.key === "Enter") {
        submitAnswer();
      }
    }
  });

  //request number
  $(".numberButton").click(function (e) {
    socket.emit("selectNumber", e.target.id);
  });

  //receive letter
  socket.on("selectNumber", function (number, numberToReach) {
    $("#letterHolder").find("span:empty:first").text(number);

    //start countdown when all numbers are selected
    if ($("#letterHolder").find("span:last").text() != "") {
      numberToReach.split("").forEach((letter) => {
        $("#numberHolder").find("span:empty:first").text(letter);
      });

      Toast.fire({
        title: "Countdown!",
      });
      $("#roundUpdate").html("Enter your solution...");

      socket.emit("startTimer", roundTimer);
      $(".numberButton").hide();
    }
  });

  //check answer for errors before submit
  $("#answerNumber").keyup(function (e) {
    let str = $("#answerNumber").val();
    let hasError = false;
    let errorTitle = "";
    var letters = /^[x0-9 =\n+-/*()]+$/;

    //only allow numbers and maths symbols
    if (!str.match(letters)) {
      hasError = true;
      errorTitle = "You can not include letters in the answer";
    }

    if (hasError) {
      $("#answerNumber").attr("title", errorTitle);
      $("#answerNumber").tooltip({
        container: ".wrapper",
      });
      $("#answerNumber").tooltip("show");
      $("#submitAnswer").prop("disabled", true);
    } else {
      $("#answerNumber").tooltip("dispose");
      $("#submitAnswer").prop("disabled", false);
    }
  });

  $(".conundrumButton").click(function (e) {
    socket.emit("getConundrum");
  });

  socket.on("selectConundrum", function (conundrum) {
    let strToArr = conundrum.toUpperCase().split("");

    strToArr.forEach((letter) => {
      $("#letterHolder").find("span:empty:first").text(letter);
      roundLetters.letters.push(letter);
    });

    //start countdown
    Toast.fire({
      title: "Countdown!",
    });
    $("#roundUpdate").html("Enter your solution...");

    socket.emit("startTimer", roundTimer);
    $(".conundrumButton").hide();
  });

  socket.on("guessedConundrum", function (response) {
    var conundrumHTML = "";
    conundrumHTML += '<div style="text-align:center">';
    conundrumHTML +=
      '<p><font color="blue">' +
      response.answer.toUpperCase() +
      '</font> by  <font color="blue">' +
      response.user +
      "</font></p> ";
    conundrumHTML += "<h3>Result</h3>";
    if (response.correct) {
      conundrumHTML += '<p><font color="green">Correct</font></p>';
    } else {
      conundrumHTML += '<p><font color="red">Incorrect</font></p>';
    }
    conundrumHTML += "</div>";

    Swal.fire({
      title: "Conundrum",
      html: conundrumHTML,
      timer: 5000,
      timerProgressBar: true,
      showConfirmButton: false,
      allowOutsideClick: false,
      showCancelButton: false,
    }).then(() => {
      if (response.correct) {
        roundNumber++;

        if (roundOrder[roundNumber]) {
          setRound(roundOrder[roundNumber]);
        } else {
          endGame();
        }
      } else {
        socket.emit("resumeTimer");
      }
    });
  });

  $("#submitAnswer").click(function (e) {
    submitAnswer();
  });

  //submit answer
  function submitAnswer() {
    if (currentRound == "letters") {
      socket.emit("submitAnswer", {
        answer: $("#answerLetter").val().toLowerCase(),
        user: username,
      });
    } else if (currentRound == "numbers") {
      socket.emit("submitAnswer", {
        answer: $("#answerNumber").val(),
        user: username,
      });
    } else if (currentRound == "conundrum") {
      socket.emit("checkConundrum", {
        answer: $("#answerLetter").val().toUpperCase(),
        user: username,
      });
    }

    $("#answerNumber").prop("disabled", true);
    $("#answerLetter").prop("disabled", true);
    $("#submitAnswer").prop("disabled", true);
    $("#roundUpdate").html("Waiting for round to end...");
  }

  //timer
  socket.on("timer", function (timeLeft) {
    $("#base-timer-label").text(timeLeft);
    setCircleDasharray(timeLeft);
    setRemainingPathColor(timeLeft);

    if (timeLeft === 0) {
      Toast.fire({
        title: "Time's Up!",
      });
      $("#roundUpdate").html("");

      $("#answerNumber").prop("disabled", true);
      $("#answerLetter").prop("disabled", true);
      $("#submitAnswer").prop("disabled", true);
    }
  });

  document.getElementById("timer").innerHTML = `
  <div class="base-timer">
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <text x="50%" y="50%" text-anchor="middle" id="base-timer-label" style="font-size: x-large;" stroke="#000" stroke-width="1px" dy=".3em">30</text>

      <g class="base-timer__circle">
        <circle class="base-timer__path-elapsed" cx="50" cy="50" r="45"></circle>

        <path
          id="base-timer-path-remaining"
          stroke-dasharray="283"
          class="base-timer__path-remaining green"
          d="
            M 50, 50
            m -45, 0
            a 45,45 0 1,0 90,0
            a 45,45 0 1,0 -90,0
          "
        ></path>
      </g>
    </svg>
  </div>
  `;

  function setRemainingPathColor(timeLeft) {
    if (timeLeft <= 5) {
      $("#base-timer-path-remaining").removeClass("orange").addClass("red");
    } else if (timeLeft <= 10) {
      $("#base-timer-path-remaining").removeClass("green").addClass("orange");
    }
  }

  function calculateTimeFraction(timeLeft) {
    const rawTimeFraction = timeLeft / roundTimer;
    return rawTimeFraction - (1 / roundTimer) * (1 - rawTimeFraction);
  }

  function setCircleDasharray(timeLeft) {
    const circleDasharray = `${(calculateTimeFraction(timeLeft) * 283).toFixed(
      0
    )} 283`;
    document
      .getElementById("base-timer-path-remaining")
      .setAttribute("stroke-dasharray", circleDasharray);
  }

  //get answers
  socket.on("showAnswers", function (responses, bestSolution) {
    $("#roundUpdate").html("");
    //show end of round screen
    var res = Math.max.apply(
      Math,
      responses.map(function (o) {
        return o.score;
      })
    );
    var best = responses.find(function (o) {
      return o.score == res;
    });

    var scoresHTML = "";

    if (best) {
      if (currentRound == "letters") {
        scoresHTML += '<div style="text-align:center">';
        scoresHTML += "<h3>Best Word</h3>";
        scoresHTML +=
          '<p><font color="blue">' +
          best.answer +
          '</font> by  <font color="blue">' +
          best.user +
          "</font></p> ";
        scoresHTML += "<h3>Definition</h3>";
        scoresHTML += "<p>" + best.definition.substring(0, 200) + "...</p><br>";
        scoresHTML += "</div>";
      } else if (currentRound == "numbers") {
        scoresHTML += '<div style="text-align:center">';
        scoresHTML += "<h3>Best Score</h3>";
        scoresHTML +=
          '<p><font color="blue">' +
          best.score +
          '</font> points by <font color="blue">' +
          best.user +
          "</font></p> ";
      } else if (currentRound == "conundrum") {
      }
    }

    scoresHTML += '<div style="text-align:center">';
    scoresHTML += "<h3>Solution</h3>";
    if (currentRound == "letters") {
      scoresHTML +=
        '<p style="white-space: pre-line;">' +
        bestSolution[0] +
        "</p><br>" +
        '<p style="white-space: pre-line;">' +
        bestSolution[1] +
        "</p><br>";
    } else {
      scoresHTML +=
        '<p style="white-space: pre-line;">' + bestSolution + "</p><br>";
    }

    scoresHTML += "</div>";

    if (responses.length != 0) {
      scoresHTML +=
        '<div id="tempScores" style="text-align:center;height: 200px;">';
      scoresHTML += "<h3>Round Scores</h3>";

      if (currentRound == "letters") {
        responses.forEach((response) => {
          scoresHTML +=
            "<span>" +
            response.user +
            ": " +
            response.answer +
            " - " +
            response.score +
            " points </span> <br>";
        });
      } else if (currentRound == "numbers") {
        responses.forEach((response) => {
          scoresHTML +=
            "<span>" +
            response.user +
            ": " +
            response.answer.split("=")[response.answer.split("=").length - 1] +
            " - " +
            response.score +
            " points </span><br>";
        });
      }
      scoresHTML += "</div>";
    }

    roundNumber++;
    Swal.fire({
      title: "Round complete",
      html: scoresHTML,
      timer: 10000,
      timerProgressBar: true,
      showConfirmButton: false,
      allowOutsideClick: false,
      showCancelButton: false,
      preConfirm: () => {
        $("#tempScores").scrollTop($("#tempScores")[0].scrollHeight);
      },
    }).then(() => {
      if (roundOrder[roundNumber]) {
        setRound(roundOrder[roundNumber]);
      } else {
        endGame();
      }
    });
  });

  function endGame() {
    $("#roundHolder").hide();
    $("#endGameScreen").show();
  }

  //server messages
  socket.on("message", function (message) {
    var from = message[0];
    var msg = message[1];
    var color = message[2];

    $("#messages").append(
      $('<li class="messageHolder">').html(
        '<span class="messageText" style="font-weight: bold;color:' +
          color +
          ';">' +
          from +
          ':</span><span  class="messageText">' +
          msg +
          "</span>"
      )
    );

    $("#messageHolder").animate(
      { scrollTop: $("#messageHolder")[0].scrollHeight },
      1000
    );

    currentNotes = $("#notification").text();
    if (currentNotes) {
      updateNote = parseInt(currentNotes) + 1;
      $("#notification").text(updateNote);
    } else {
      $("#notification").text("1");
    }
  });

  //send message
  $("#inputMessage").keyup(function (e) {
    if (e.keyCode === 13) {
      socket.emit("message", $("#inputMessage").val());
      $("#inputMessage").val("");
    }
  });

  function getUserName() {
    Swal.fire({
      title: "Countdown With Friends",
      input: "text",
      text: "Enter your name",
      confirmButtonText: "Next",
      allowOutsideClick: false,
      showCancelButton: false,
      inputValidator: (value) => {
        if (!value) {
          return "You need to enter a name";
        }
      },
    }).then((name) => {
      username = name.value;

      invited = checkInvitation();

      if (!invited) {
        joinRoom();
      }
    });
  }

  //join a room
  function joinRoom() {
    var results = {};
    results.username = username;

    //get rooms
    socket.emit("getRooms");
    socket.on("rooms", function (roomData) {
      var getRooms = roomData[0];
      var playerCount = roomData[1];
      if (!roomSelected) {
        var table_body =
          '<div class="table-responsive"><table class="table table-custom"><thead><tr>';

        //add online player count
        table_body +=
          '<div style="display: flex;justify-content: flex-end;">Online: <span style="color: #28a745;font-weight: bold;">' +
          playerCount +
          "</span></div>";

        table_body +=
          '<th scope="col">Room</th> <th scope="col">Type</th> <th scope="col">Host</th>  <th scope="col">Players</th> <th scope="col">Open</th> <th scope="col"></th>';
        table_body += "</tr></thead>";
        table_body += "<tbody>";

        //add existing room to table
        if (Object.keys(getRooms).length != 0) {
          for (var room in getRooms) {
            table_body += "<tr>";
            table_body += "<td>" + room + "</td>";
            table_body += "<td>" + getRooms[room].type + "</td>";
            table_body += "<td>" + getRooms[room].host + "</td>";
            table_body +=
              "<td>" + Object.keys(getRooms[room].sockets).length + "</td>";
            table_body += "<td>" + getRooms[room].open + "</td>";
            table_body +=
              '<td><button class="btn btn-success btn-custom joinButton" data-open="' +
              getRooms[room].open +
              '" id="' +
              room +
              '">join</button</td>';
            table_body += "</tr>";
          }
        } else {
          table_body += "<tr><td>No open games</td></tr>";
        }

        table_body += "</tbody></table></div>";

        Swal.fire({
          title: "Join Game",
          html: table_body,
          width: 800,
          confirmButtonText: "Create a room",
          allowOutsideClick: false,
          showCancelButton: false,
          onBeforeOpen: () => {
            //add click to join buttons
            $(".joinButton").on("click", function (event) {
              //joining a existing room
              results.room = $(this)[0].id;

              if ($(this)[0].attributes["data-open"].value === "Private") {
                Swal.fire({
                  title: "Password",
                  text: "Password for room: " + results.room,
                  input: "text",
                  confirmButtonText: "Enter",
                  allowOutsideClick: false,
                  showCancelButton: true,
                  inputValidator: (value) => {
                    if (!value) {
                      return "You need to enter the password";
                    }
                  },
                }).then((password) => {
                  if (password.dismiss) {
                    roomSelected = false;
                    joinRoom();
                  } else {
                    //join private game
                    results.password = password.value;
                    addUser(results);
                    Swal.close();
                  }
                });
              } else {
                addUser(results);
                Swal.close();
              }
            });
          },
        }).then((newRoom) => {
          //creating new room
          if (newRoom.isConfirmed) {
            Swal.fire({
              title: "Room Details",
              html:
                '<div id="swal2-content" class="swal2-html-container" style="display: block;">Room name</div>' +
                '<input id="swal-roomname" maxlength="20" class="swal2-input">' +
                '<div id="swal2-content" class="swal2-html-container" style="display: block;">Game type</div>' +
                '<div style="display:flex; align-items:center;justify-content:center;background:#fff;color:inherit"><label style="margin:0.6em;font-size:1.125em"><input style="margin:0.4em" type="radio" name="swal2-radio-type" value="Classic" checked="checked"><span class="swal2-label">Classic</span></label><label style="margin:0.6em;font-size:1.125em"><input style="margin:0.4em" type="radio" name="swal2-radio-type" value="Knockout"><span class="swal2-label">Knockout</span></label></div>' +
                '<div id="swal2-content" class="swal2-html-container" style="display: block;">Game availability</div>' +
                '<div style="display:flex; align-items:center;justify-content:center;background:#fff;color:inherit"><label style="margin:0.6em;font-size:1.125em"><input style="margin:0.4em" type="radio" name="swal2-radio-open" value="Public" checked="checked"><span class="swal2-label">Public</span></label><label style="margin:0.6em;font-size:1.125em"><input style="margin:0.4em" type="radio" name="swal2-radio-open" value="Private"><span class="swal2-label">Private</span></label></div>' +
                '<div id="swal2-content" class="swal2-html-container" style="display: block;">Rounds</div>' +
                '<div style="display:flex; align-items:center;justify-content:center;background:#fff;color:inherit"><label style="margin:0.6em;font-size:1.125em"><input style="margin:0.4em" type="radio" name="swal2-radio-rounds" value="5" checked="checked"><span class="swal2-label">5</span></label><label style="margin:0.6em;font-size:1.125em"><input style="margin:0.4em" type="radio" name="swal2-radio-rounds" value="10"><span class="swal2-label">10</span></label><label style="margin:0.6em;font-size:1.125em"><input style="margin:0.4em" type="radio" name="swal2-radio-rounds" value="15"><span class="swal2-label">15</span></label></div>' +
                '<div id="swal2-content" class="swal2-html-container" style="display: block;">Countdown timer</div>' +
                '<div style="display:flex; align-items:center;justify-content:center;background:#fff;color:inherit"><label style="margin:0.6em;font-size:1.125em"><input style="margin:0.4em" type="radio" name="swal2-radio-time" value="30" checked="checked"><span class="swal2-label">30</span></label><label style="margin:0.6em;font-size:1.125em"><input style="margin:0.4em" type="radio" name="swal2-radio-time" value="60"><span class="swal2-label">60</span></label><label style="margin:0.6em;font-size:1.125em"><input style="margin:0.4em" type="radio" name="swal2-radio-time" value="90"><span class="swal2-label">90</span></label></div>' +
                '<div id="swal2-content" class="swal2-html-container" style="display: block;">Password</div>' +
                '<input id="swal-password" placeholder="Only needed for private games..." class="swal2-input">',
              focusConfirm: false,
              allowOutsideClick: false,
              onBeforeOpen: () => {
                $("#swal-roomname").keyup(function (e) {
                  if (e.keyCode === 13) {
                    $('input[name="swal2-radio-type"]')[0].focus();
                  }
                });
              },
              preConfirm: () => {
                return [
                  document.getElementById("swal-roomname").value,
                  document.querySelector(
                    'input[name="swal2-radio-type"]:checked'
                  ).value,
                  document.querySelector(
                    'input[name="swal2-radio-open"]:checked'
                  ).value,
                  document.querySelector(
                    'input[name="swal2-radio-rounds"]:checked'
                  ).value,
                  document.querySelector(
                    'input[name="swal2-radio-time"]:checked'
                  ).value,
                  document.getElementById("swal-password").value,
                ];
              },
            }).then((createRoom) => {
              if (createRoom.value) {
                if (createRoom.value[0] == "") {
                  results.room = "Room" + Math.floor(Math.random() * 10000);
                } else {
                  results.room = createRoom.value[0].replace(/ /g, "-");
                }
                results.type = createRoom.value[1];
                results.open = createRoom.value[2];
                results.rounds = createRoom.value[3];
                results.time = createRoom.value[4];
                results.password = createRoom.value[5];

                //this user is the host
                host = true;

                addUser(results);
              }
            });
          }
        });

        roomSelected = true;
      }
    });
  }

  function addUser(values) {
    //adding
    socket.emit("addUser", values);

    //get current users
    retrievedUsers = false;
    socket.emit("getUsers");

    //only get once
    socket.on("users", function (users) {
      if (!retrievedUsers) {
        retrievedUsers = true;
        users.pop();

        users.forEach((user) => {
          $("#users").append(
            $('<li style="color:' + user.color + '">').text(user.name)
          );
        });
      }
    });

    //room title
    document.querySelector(".room-title").innerHTML = values.room;

    //update invite links
    $(".a2a_kit").attr(
      "data-a2a-url",
      "https://countdown-with-friends.herokuapp.com/?Room=" + values.room
    );

    $("#info").show();
    $("#exit").show();

    //host can start game
    if (host) {
      $("#startGame").prop("disabled", false);
      $("#startGame").html("Start Game");
    } else {
      $("#startGame").html("Waiting for host to start the game...");
    }
  }

  //user has been knocked out of the game
  socket.on("knockedOut", function () {
    stillPlaying = false;
  });

  //selected as host
  socket.on("newHost", function () {
    host = true;

    Toast.fire({
      title: "You have been assigned as the host",
    });

    $("#startGame").html("Start Game");
    $("#startGame").prop("disabled", false);
  });

  //game in progress find another room
  socket.on("gameInProgress", function (roomname) {
    swal
      .fire(
        "Game in progress",
        "The game has already started in room: " + roomname,
        "warning"
      )
      .then(() => {
        roomSelected = false;
        joinRoom();
      });
  });

  //wrong password find another room
  socket.on("wrongPassword", function (roomname) {
    swal
      .fire(
        "Wrong password",
        "You did not enter the correct password for room: " + roomname,
        "warning"
      )
      .then(() => {
        roomSelected = false;
        joinRoom();
      });
  });

  const Toast = Swal.mixin({
    toast: true,
    position: "top-end",
    showConfirmButton: false,
    timer: 3000,
    onOpen: (toast) => {
      toast.addEventListener("mouseenter", Swal.stopTimer);
      toast.addEventListener("mouseleave", Swal.resumeTimer);
    },
  });

  function showOffline() {
    Swal.fire({
      title: "Offline",
      html:
        "You are not connected to the internet.<br> Please check your connection.",
      icon: "warning",
      allowOutsideClick: false,
      showCancelButton: false,
      showConfirmButton: false,
    });
  }

  function checkInvitation() {
    //IE check
    var ua = window.navigator.userAgent;
    var msie = ua.indexOf("MSIE ");
    var invited = false;

    if (msie > 0 || !!navigator.userAgent.match(/Trident.*rv\:11\./)) {
    } else {
      let searchParams = new URLSearchParams(window.location.search);
      let inviteRoom = searchParams.get("Room");

      var joining = {};
      // user was invited to room
      if (inviteRoom) {
        invited = true;
        socket.emit("checkRoom", inviteRoom);
      }
    }

    return invited;
  }

  socket.on("FoundRoom", function (room) {
    var joining = {};

    if (room.found) {
      joining.username = username;
      joining.room = room.name;

      //password check
      if (room.found.open === "Private") {
        Swal.fire({
          title: "Password",
          text: "Password for room: " + room.name,
          input: "text",
          confirmButtonText: "Enter",
          allowOutsideClick: false,
          showCancelButton: true,
          inputValidator: (value) => {
            if (!value) {
              return "You need to enter the password";
            }
          },
        }).then((password) => {
          if (password.dismiss) {
            joinRoom();
          } else {
            //join private game
            joining.password = password.value;
            addUser(joining);
          }
        });
      } else {
        addUser(joining);
      }
    } else {
      swal
        .fire(
          "Game Not Found",
          room.name + " does not exist or the game has finished",
          "warning"
        )
        .then(() => {
          roomSelected = false;
          joinRoom();
        });
    }
  });

  $(".focusInput")
    .focusin(function () {
      if (window.matchMedia("(max-width: 768px)").matches) {
        $(".sidebarCollapse").hide();
        $(".card-footer").hide();
        $("#draw-tab").hide();
        $("#type-tab").hide();
      }
    })
    .focusout(function () {
      if (window.matchMedia("(max-width: 768px)").matches) {
        $(".sidebarCollapse").show();
        $(".card-footer").show();
        $("#draw-tab").show();
        $("#type-tab").show();
      }
    });

  $(window).resize(function () {
    //responsiveCanvas(); //resize canvas
  });

  $("#draw-tab").on("click", function () {
    responsiveCanvas(); //resize canvas
  });

  var max = 3;
  var runs = 0;
  function responsiveCanvas() {
    $("#whiteboard").each(function (e) {
      var parentWidth = $(this).parent().outerWidth();
      $(this).attr("width", parentWidth);
      $(this).attr("height", 158);
    });
    $("#whiteboard").jqScribble();

    if (runs < max) {
      //not set correctly on first run. do it again
      var refresh = setInterval(function () {
        runs++;
        responsiveCanvas();
        clearInterval(refresh);
      }, 0500);
    }
  }
}); //end main
