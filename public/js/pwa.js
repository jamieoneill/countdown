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
        $("#roundUpdate").html("");
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

  var socket = io.connect({ reconnection: false });

  socket.on("connect_error", () => {
    swal.close();
    swal.fire({
      title: "Maintenance",
      text:
        "Our server is undergoing maintenance. This is usually pretty short please check back again soon.",
      icon: "warning",
      showConfirmButton: false,
      allowOutsideClick: false,
    });
  });

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
  var numOfLarge = 0;

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
        shownKnockOut = true;
        swal.fire(
          "Knocked Out!",
          "You have been knocked out of the game. You can still watch the game without playing or exit the room to join a new game.",
          "warning"
        );
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
    $(".numberButton").prop("disabled", false);
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
    if (e.target.id == "large") {
      numOfLarge++;
    }

    //max 4 large
    if (numOfLarge == 4) {
      $("#large").prop("disabled", true);
    }

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
      numOfLarge = 0;

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
      //title: "<span class='cd-letter'>C</span>ountdown<br><span class='cd-letter'>W</span>ith Friends",
      html:
        '<span class="cd-letter">C</span><span class="post-cd-letter">OUNTDOWN</span> <br>' +
        '<span class="cd-letter">W</span><span class="post-cd-letter">ITH FRIENDS</span> <br>' +
        '<img style="height: 100px;" src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iaXNvLTg4NTktMSI/Pg0KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDE3LjEuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPg0KPCFET0NUWVBFIHN2ZyBQVUJMSUMgIi0vL1czQy8vRFREIFNWRyAxLjEvL0VOIiAiaHR0cDovL3d3dy53My5vcmcvR3JhcGhpY3MvU1ZHLzEuMS9EVEQvc3ZnMTEuZHRkIj4NCjxzdmcgdmVyc2lvbj0iMS4xIiBpZD0iQ2FwYV8xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4PSIwcHgiIHk9IjBweCINCgkgdmlld0JveD0iMCAwIDUxMiA1MTIiIHN0eWxlPSJlbmFibGUtYmFja2dyb3VuZDpuZXcgMCAwIDUxMiA1MTI7IiB4bWw6c3BhY2U9InByZXNlcnZlIj4NCjxnPg0KCTxwYXRoIGQ9Ik00MzcuMDIsNzQuOThDMzg4LjY2NywyNi42MjgsMzI0LjM4LDAsMjU2LDBTMTIzLjMzMywyNi42MjgsNzQuOTgsNzQuOThTMCwxODcuNjIsMCwyNTZzMjYuNjI4LDEzMi42NjcsNzQuOTgsMTgxLjAyDQoJCVMxODcuNjIsNTEyLDI1Niw1MTJzMTMyLjY2Ny0yNi42MjgsMTgxLjAyLTc0Ljk4UzUxMiwzMjQuMzgsNTEyLDI1NlM0ODUuMzcyLDEyMy4zMzMsNDM3LjAyLDc0Ljk4eiBNNDI1LjcwNiw0MjUuNzA2DQoJCUMzODAuMzc2LDQ3MS4wMzYsMzIwLjEwNiw0OTYsMjU2LDQ5NnMtMTI0LjM3Ni0yNC45NjQtMTY5LjcwNi03MC4yOTRDNDAuOTY0LDM4MC4zNzYsMTYsMzIwLjEwNiwxNiwyNTYNCgkJUzQwLjk2NCwxMzEuNjI0LDg2LjI5NCw4Ni4yOTRDMTMxLjYyNCw0MC45NjQsMTkxLjg5NCwxNiwyNTYsMTZzMTI0LjM3NiwyNC45NjQsMTY5LjcwNiw3MC4yOTQNCgkJQzQ3MS4wMzYsMTMxLjYyNCw0OTYsMTkxLjg5NCw0OTYsMjU2UzQ3MS4wMzYsMzgwLjM3Niw0MjUuNzA2LDQyNS43MDZ6Ii8+DQoJPHBhdGggZD0iTTQ4LDI1NmMwLTExNC42OTEsOTMuMzA5LTIwOCwyMDgtMjA4YzQxLjM2OCwwLDgxLjMyNiwxMi4xMTEsMTE1LjU1NSwzNS4wMjRjMy42NzEsMi40NTgsOC42NCwxLjQ3NCwxMS4wOTgtMi4xOTgNCgkJYzIuNDU4LTMuNjcxLDEuNDc0LTguNjQtMi4xOTgtMTEuMDk4QzM0My41ODQsNDUuMDQ2LDMwMC41NDgsMzIsMjU2LDMyYy01OS44MzMsMC0xMTYuMDg0LDIzLjMtMTU4LjM5Miw2NS42MDgNCgkJQzU1LjMsMTM5LjkxNiwzMiwxOTYuMTY3LDMyLDI1NmMwLDU1LjIsMjAuMjU0LDEwOC4yMzIsNTcuMDMyLDE0OS4zMjhjMS41OCwxLjc2NiwzLjc2OCwyLjY2NSw1Ljk2NCwyLjY2NQ0KCQljMS44OTksMCwzLjgwNi0wLjY3Miw1LjMzMi0yLjAzOWMzLjI5Mi0yLjk0NywzLjU3My04LjAwNCwwLjYyNi0xMS4yOTZDNjYuODA3LDM1Ni41LDQ4LDMwNy4yNTcsNDgsMjU2eiIvPg0KCTxwYXRoIGQ9Ik00NDIuMjczLDEzMS41NDdjLTIuNDU4LTMuNjcyLTcuNDI3LTQuNjU2LTExLjA5OC0yLjE5OGMtMy42NzEsMi40NTgtNC42NTYsNy40MjctMi4xOTgsMTEuMDk4DQoJCUM0NTEuODg5LDE3NC42NzUsNDY0LDIxNC42MzMsNDY0LDI1NmMwLDExNC42OTEtOTMuMzA5LDIwOC0yMDgsMjA4Yy00Ny41ODMsMC05NC4wOTYtMTYuNDc5LTEzMC45NjktNDYuNDAxDQoJCWMtMy40MzEtMi43ODQtOC40NjktMi4yNi0xMS4yNTMsMS4xNzFzLTIuMjYsOC40NjksMS4xNzEsMTEuMjUzQzE1NC42NjQsNDYyLjI1MSwyMDQuNzU3LDQ4MCwyNTYsNDgwDQoJCWM1OS44MzMsMCwxMTYuMDg0LTIzLjMsMTU4LjM5Mi02NS42MDhDNDU2LjcsMzcyLjA4NCw0ODAsMzE1LjgzMyw0ODAsMjU2QzQ4MCwyMTEuNDUzLDQ2Ni45NTQsMTY4LjQxNyw0NDIuMjczLDEzMS41NDd6Ii8+DQoJPHBhdGggZD0iTTM5NC42NTgsMTAwLjk1NWM1LjM3OSw0LjgxMywxMC41NjUsOS45NjQsMTUuNDE0LDE1LjMwOGMxLjU3OSwxLjc0LDMuNzQ5LDIuNjI0LDUuOTI3LDIuNjI0DQoJCWMxLjkxNywwLDMuODQyLTAuNjg2LDUuMzc0LTIuMDc2YzMuMjcxLTIuOTY5LDMuNTE3LTguMDI5LDAuNTQ4LTExLjMwMWMtNS4yMi01Ljc1Mi0xMC44MDMtMTEuMjk2LTE2LjU5My0xNi40NzgNCgkJYy0zLjI5Mi0yLjk0Ni04LjM1LTIuNjY2LTExLjI5NiwwLjYyNlMzOTEuMzY1LDk4LjAwOCwzOTQuNjU4LDEwMC45NTV6Ii8+DQoJPHBhdGggZD0iTTI1NiwxMDRjNC40MTgsMCw4LTMuNTgyLDgtOFY3MmMwLTQuNDE4LTMuNTgyLTgtOC04cy04LDMuNTgyLTgsOHYyNEMyNDgsMTAwLjQxOCwyNTEuNTgyLDEwNCwyNTYsMTA0eiIvPg0KCTxwYXRoIGQ9Ik0yNDgsNDE2djI0YzAsNC40MTgsMy41ODIsOCw4LDhzOC0zLjU4Miw4LTh2LTI0YzAtNC40MTgtMy41ODItOC04LThTMjQ4LDQxMS41ODIsMjQ4LDQxNnoiLz4NCgk8cGF0aCBkPSJNMTA0LDI1NmMwLTQuNDE4LTMuNTgyLTgtOC04SDcyYy00LjQxOCwwLTgsMy41ODItOCw4czMuNTgyLDgsOCw4aDI0QzEwMC40MTgsMjY0LDEwNCwyNjAuNDE4LDEwNCwyNTZ6Ii8+DQoJPHBhdGggZD0iTTQwOCwyNTZjMCw0LjQxOCwzLjU4Miw4LDgsOGgyNGM0LjQxOCwwLDgtMy41ODIsOC04cy0zLjU4Mi04LTgtOGgtMjRDNDExLjU4MiwyNDgsNDA4LDI1MS41ODIsNDA4LDI1NnoiLz4NCgk8cGF0aCBkPSJNMTgyLjkyOCwxMTMuNDM2bC0xMi0yMC43ODVjLTIuMjA5LTMuODI3LTcuMTAyLTUuMTM2LTEwLjkyOC0yLjkyOGMtMy44MjYsMi4yMDktNS4xMzcsNy4xMDItMi45MjgsMTAuOTI4bDEyLDIwLjc4NQ0KCQljMS40ODIsMi41NjYsNC4xNzEsNC4wMDEsNi45MzYsNC4wMDFjMS4zNTcsMCwyLjczMy0wLjM0NiwzLjk5My0xLjA3M0MxODMuODI2LDEyMi4xNTUsMTg1LjEzNywxMTcuMjYyLDE4Mi45MjgsMTEzLjQzNnoiLz4NCgk8cGF0aCBkPSJNMzQyLjkyOCwzOTAuNTY0Yy0yLjIwOS0zLjgyNi03LjEwMy01LjEzNS0xMC45MjgtMi45MjhjLTMuODI2LDIuMjA5LTUuMTM3LDcuMTAyLTIuOTI4LDEwLjkyOGwxMiwyMC43ODUNCgkJYzEuNDgyLDIuNTY2LDQuMTcxLDQuMDAxLDYuOTM2LDQuMDAxYzEuMzU3LDAsMi43MzMtMC4zNDYsMy45OTMtMS4wNzNjMy44MjYtMi4yMDksNS4xMzctNy4xMDIsMi45MjgtMTAuOTI4TDM0Mi45MjgsMzkwLjU2NHoiLz4NCgk8cGF0aCBkPSJNOTYuNjU5LDM1Ni4wMDFjMS4zNTcsMCwyLjczMy0wLjM0NiwzLjk5My0xLjA3M2wyMC43ODUtMTJjMy44MjYtMi4yMDksNS4xMzctNy4xMDIsMi45MjgtMTAuOTI4DQoJCWMtMi4yMDktMy44MjYtNy4xMDMtNS4xMzUtMTAuOTI4LTIuOTI4bC0yMC43ODUsMTJjLTMuODI2LDIuMjA5LTUuMTM3LDcuMTAyLTIuOTI4LDEwLjkyOA0KCQlDOTEuMjA1LDM1NC41NjYsOTMuODk0LDM1Ni4wMDEsOTYuNjU5LDM1Ni4wMDF6Ii8+DQoJPHBhdGggZD0iTTM5NC41NzEsMTg0LjAwMWMxLjM1NywwLDIuNzMzLTAuMzQ2LDMuOTkzLTEuMDczbDIwLjc4NS0xMmMzLjgyNi0yLjIwOSw1LjEzNy03LjEwMiwyLjkyOC0xMC45MjgNCgkJcy03LjEwMi01LjEzNS0xMC45MjgtMi45MjhsLTIwLjc4NSwxMmMtMy44MjYsMi4yMDktNS4xMzcsNy4xMDItMi45MjgsMTAuOTI4QzM4OS4xMTgsMTgyLjU2NiwzOTEuODA3LDE4NC4wMDEsMzk0LjU3MSwxODQuMDAxeiINCgkJLz4NCgk8cGF0aCBkPSJNMzUyLDg5LjcyM2MtMy44MjYtMi4yMS04LjcxOS0wLjg5OS0xMC45MjgsMi45MjhsLTEyLDIwLjc4NWMtMi4yMDksMy44MjYtMC44OTgsOC43MTksMi45MjgsMTAuOTI4DQoJCWMxLjI2LDAuNzI4LDIuNjM1LDEuMDczLDMuOTkzLDEuMDczYzIuNzY1LDAsNS40NTQtMS40MzUsNi45MzYtNC4wMDFsMTItMjAuNzg1QzM1Ny4xMzcsOTYuODI1LDM1NS44MjYsOTEuOTMyLDM1Miw4OS43MjN6Ii8+DQoJPHBhdGggZD0iTTE4MCwzODcuNjM2Yy0zLjgyNi0yLjIwOS04LjcxOS0wLjg5OC0xMC45MjgsMi45MjhsLTEyLDIwLjc4NWMtMi4yMDksMy44MjYtMC44OTgsOC43MTksMi45MjgsMTAuOTI4DQoJCWMxLjI2LDAuNzI4LDIuNjM1LDEuMDczLDMuOTkzLDEuMDczYzIuNzY1LDAsNS40NTQtMS40MzUsNi45MzYtNC4wMDFsMTItMjAuNzg1QzE4NS4xMzcsMzk0LjczOCwxODMuODI2LDM4OS44NDUsMTgwLDM4Ny42MzZ6Ii8+DQoJPHBhdGggZD0iTTM5MC41NjQsMzQyLjkyOGwyMC43ODUsMTJjMS4yNiwwLjcyOCwyLjYzNSwxLjA3MywzLjk5MywxLjA3M2MyLjc2NSwwLDUuNDU0LTEuNDM1LDYuOTM2LTQuMDAxDQoJCWMyLjIwOS0zLjgyNiwwLjg5OC04LjcxOS0yLjkyOC0xMC45MjhsLTIwLjc4NS0xMmMtMy44MjYtMi4yMS04LjcxOS0wLjg5OC0xMC45MjgsMi45MjgNCgkJQzM4NS40MjcsMzM1LjgyNiwzODYuNzM4LDM0MC43MTksMzkwLjU2NCwzNDIuOTI4eiIvPg0KCTxwYXRoIGQ9Ik0xMjEuNDM2LDE2OS4wNzJsLTIwLjc4NS0xMmMtMy44MjYtMi4yMS04LjcxOS0wLjg5OC0xMC45MjgsMi45MjhjLTIuMjA5LDMuODI2LTAuODk4LDguNzE5LDIuOTI4LDEwLjkyOGwyMC43ODUsMTINCgkJYzEuMjYsMC43MjgsMi42MzUsMS4wNzMsMy45OTMsMS4wNzNjMi43NjUsMCw1LjQ1NC0xLjQzNSw2LjkzNi00LjAwMUMxMjYuNTczLDE3Ni4xNzQsMTI1LjI2MiwxNzEuMjgxLDEyMS40MzYsMTY5LjA3MnoiLz4NCgk8cGF0aCBkPSJNMzExLjY5MiwzNjAuNDUxYzEuMzU3LDAsMi43MzMtMC4zNDYsMy45OTMtMS4wNzNjMy44MjYtMi4yMDksNS4xMzctNy4xMDIsMi45MjgtMTAuOTI4bC00NC4zOC03Ni44NjkNCgkJQzI3Ny44MjQsMjY3LjM4NCwyODAsMjYxLjk0MywyODAsMjU2YzAtMTAuNDI5LTYuNjg5LTE5LjMyMi0xNi0yMi42MjRWMTI4YzAtNC40MTgtMy41ODItOC04LThzLTgsMy41ODItOCw4djEwNS4zNzYNCgkJYy05LjMxMSwzLjMwMi0xNiwxMi4xOTUtMTYsMjIuNjI0YzAsMTMuMjM0LDEwLjc2NiwyNCwyNCwyNGMxLjQ5NywwLDIuOTYxLTAuMTQ1LDQuMzgzLTAuNDA4bDQ0LjM3NCw3Ni44NTgNCgkJQzMwNi4yMzksMzU5LjAxNiwzMDguOTI4LDM2MC40NTEsMzExLjY5MiwzNjAuNDUxeiBNMjQ4LDI1NmMwLTQuNDExLDMuNTg5LTgsOC04czgsMy41ODksOCw4cy0zLjU4OSw4LTgsOFMyNDgsMjYwLjQxMSwyNDgsMjU2eiINCgkJLz4NCjwvZz4NCjxnPg0KPC9nPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjxnPg0KPC9nPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjxnPg0KPC9nPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjxnPg0KPC9nPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjxnPg0KPC9nPg0KPGc+DQo8L2c+DQo8Zz4NCjwvZz4NCjwvc3ZnPg0K" />',
      input: "text",
      inputPlaceholder: "Enter your name...",
      confirmButtonText: "Enter",
      allowOutsideClick: false,
      showCancelButton: false,
      inputValidator: (value) => {
        if (!value) {
          return "You must enter a name to proceed";
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
    socket.emit("getRooms", false);
    socket.on("rooms", function (roomData) {
      var getRooms = roomData[0];
      var playerCount = roomData[1];
      if (!roomSelected) {
        var table_body =
          '<div class="table-responsive"><table class="table table-custom"><thead><tr>';

        //add online player count
        table_body +=
          '<div style="display: flex;justify-content: space-around;"><div style="justify-content: space-around;align-self: center;"><button id="refresh" type="button" class="btn"><i class="fas fa-sync"></i></button></div><div style="justify-content: space-around;margin-left: auto;align-self: center;">Online: <span style="color: #28a745;font-weight: bold;">' +
          playerCount +
          "</span></div></div>";

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
              '">Join</button</td>';
            table_body += "</tr>";
          }
        } else {
          table_body += "<tr><td>No open games</td></tr>";
        }

        table_body += "</tbody></table></div>";

        Swal.fire({
          html: '<span class="cd-letter">J</span><span class="post-cd-letter">OIN GAME</span><br>' + table_body,
          width: 800,
          confirmButtonText: "Create a room",
          allowOutsideClick: false,
          showCancelButton: false,
          onBeforeOpen: () => {
            //refresh button
            $("#refresh").on("click", function () {
              roomSelected = false;
              joinRoom();
            });

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
              html:
                '<span class="cd-letter">C</span><span class="post-cd-letter">REATE A GAME</span> <br>' +
                '<div id="swal2-content" class="swal2-html-container" style="display: block;"></div>' +
                '<input style="width: 80%;" id="swal-roomname" maxlength="20" class="swal2-input" placeholder="Room name">' +
                '<div id="swal2-content" class="swal2-html-container" style="display: block;"></div>' +
                '<div style="display:flex; align-items:center;justify-content:center;background:#fff;color:inherit"><label style="margin:0.6em;font-size:1.125em;"><span class="swal2-label" style="margin-left: 10px">Classic</span><input style="margin:0.4em" type="radio" name="swal2-radio-type" value="Classic" checked="checked"></label><label style="margin:0.6em;font-size:1.125em;"><span class="swal2-label" style="margin-left: 10px">Knockout</span><input style="margin:0.4em" type="radio" name="swal2-radio-type" value="Knockout"></label></div>' +
                '<div id="swal2-content" class="swal2-html-container" style="display: block;"></div>' +
                '<div style="display:flex; align-items:center;justify-content:center;background:#fff;color:inherit"><span style="width: 100px;">Availability</span><label style="margin:0.3em;font-size:1.125em"><input style="margin:0.4em" id="publicButton" type="radio" name="swal2-radio-open" value="Public" checked="checked"><span class="swal2-label">Public</span></label><label style="margin:0.3em;font-size:1.125em"><input style="margin:0.4em" type="radio" name="swal2-radio-open" id="privateButton" value="Private"><span class="swal2-label">Private</span></label></div>' +
                '<input type="hidden" style="width: 80%;" id="swal-password" placeholder="Password..." class="swal2-input">' +
                '<div id="swal2-content" class="swal2-html-container" style="display: block;"></div>' +
                '<div style="display:flex; align-items:center;justify-content:center;background:#fff;color:inherit"><span style="width: 100px;">Rounds</span><label style="margin:0.6em;font-size:1.125em"><input style="margin:0.4em" type="radio" name="swal2-radio-rounds" value="5" checked="checked"><span class="swal2-label">5</span></label><label style="margin:0.6em;font-size:1.125em"><input style="margin:0.4em" type="radio" name="swal2-radio-rounds" value="10"><span class="swal2-label">10</span></label><label style="margin:0.6em;font-size:1.125em"><input style="margin:0.4em" type="radio" name="swal2-radio-rounds" value="15"><span class="swal2-label">15</span></label></div>' +
                '<div id="swal2-content" class="swal2-html-container" style="display: block;"></div>' +
                '<div style="display:flex; align-items:center;justify-content:center;background:#fff;color:inherit"><span style="width: 100px;">Timer</span><label style="margin:0.6em;font-size:1.125em"><input style="margin:0.4em" type="radio" name="swal2-radio-time" value="30" checked="checked"><span class="swal2-label">30</span></label><label style="margin:0.6em;font-size:1.125em"><input style="margin:0.4em" type="radio" name="swal2-radio-time" value="60"><span class="swal2-label">60</span></label><label style="margin:0.6em;font-size:1.125em"><input style="margin:0.4em" type="radio" name="swal2-radio-time" value="90"><span class="swal2-label">90</span></label></div>',
              focusConfirm: false,
              confirmButtonText: "LET'S PLAY",
              allowOutsideClick: false,
              onBeforeOpen: () => {
                $("#swal-roomname").keyup(function (e) {
                  if (e.keyCode === 13) {
                    $('input[name="swal2-radio-type"]')[0].focus();
                  }
                });

                $("#publicButton").on("click", function () {
                  $("#swal-password").attr('type', 'hidden')
                });

                $("#privateButton").on("click", function () {
                  $("#swal-password").attr('type', 'text')
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
