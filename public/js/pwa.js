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
  var init = false;
  var roundLetters = { letters: [], counts: {} };

  //add as user to room
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

  //get answers
  socket.on("showAnswers", function (responses) {
    responses.forEach((response) => {
      console.log(response);
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
  //join a room
  async function joinRoom() {
    var results = {};

    //get rooms
    socket.emit("getRooms");
    socket.on("rooms", function (getRooms) {
      if (!init) {
        var table_body = '<table class="table"><thead><tr>';
        table_body +=
          '<th scope="col">Room</th><th scope="col">Host</th>  <th scope="col">Players</th> <th scope="col">Type</th> <th scope="col"></th>';
        table_body += "</tr></thead>";
        table_body += "<tbody>";

        //add existing room to table
        if (Object.keys(getRooms).length != 0) {
          for (var room in getRooms) {
            table_body += "<tr>";
            table_body += "<td>" + room + "</td>";
            table_body += "<td>" + getRooms[room].host + "</td>";
            table_body +=
              "<td>" + Object.keys(getRooms[room].sockets).length + "</td>";
            table_body += "<td>" + getRooms[room].type + "</td>";
            table_body +=
              '<td><button class="btn btn-success joinButton" data-type="' +
              getRooms[room].type +
              '" id="' +
              room +
              '">join</button</td>';
            table_body += "</tr>";
          }
        } else {
          table_body += "<tr><td>No open games</td></tr>";
        }

        table_body += "</tbody></table>";

        //add username
        Swal.fire({
          title: "Username",
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
          results.username = name.value;

          Swal.fire({
            title: "Join Game",
            html: table_body,
            confirmButtonText: "Create a room",
            allowOutsideClick: false,
            showCancelButton: false,
            onBeforeOpen: () => {
              //add click to join buttons
              $(".joinButton").on("click", function (event) {
                //joining a existing room
                results.room = $(this)[0].id;

                if ($(this)[0].attributes["data-type"].value === "Private") {
                  Swal.fire({
                    title: "Password",
                    input: "text",
                    confirmButtonText: "Enter",
                    allowOutsideClick: false,
                    showCancelButton: false,
                    inputValidator: (value) => {
                      if (!value) {
                        return "You need to enter the password";
                      }
                    },
                  }).then((password) => {
                    //join private game
                    results.password = password.value;

                    addUser(results);
                    Swal.close();
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
                  '<div id="swal2-content" class="swal2-html-container" style="display: block;">Enter room name</div>' +
                  '<input id="swal-roomname" class="swal2-input">' +
                  '<div id="swal2-content" class="swal2-html-container" style="display: block;">Game type</div>' +
                  '<div style="display:flex; margin:1em auto;align-items:center;justify-content:center;background:#fff;color:inherit"><label style="margin:0.6em;font-size:1.125em"><input style="margin:0.4em" type="radio" name="swal2-radio" value="Public" checked="checked"><span class="swal2-label">Public</span></label><label style="margin:0.6em;font-size:1.125em"><input style="margin:0.4em" type="radio" name="swal2-radio" value="Private"><span class="swal2-label">Private</span></label></div>' +
                  '<div id="swal2-content" class="swal2-html-container" style="display: block;">Enter password</div>' +
                  '<input id="swal-password" placeholder="password only needed for private games..." class="swal2-input">',
                focusConfirm: false,
                preConfirm: () => {
                  return [
                    document.getElementById("swal-roomname").value,
                    document.querySelector('input[name="swal2-radio"]:checked')
                      .value,
                    document.getElementById("swal-password").value,
                  ];
                },
              }).then((createRoom) => {
                if (createRoom.value) {
                  results.room = createRoom.value[0];
                  results.type = createRoom.value[1];
                  results.password = createRoom.value[2];

                  addUser(results);
                }
              });
            }
          });
        });

        init = true;
        return results;
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
          $("#users").append($("<li>").text(user));
        });
      }
    });
  }

  //wrong password find another room
  socket.on("wrongPassword", function (roomname) {
    swal
      .fire(
        "Wrong password",
        "You did not enter the correct password for room: " + roomname
      )
      .then(() => {
        init = false;
        joinRoom();
      });
  });
}); //end main
