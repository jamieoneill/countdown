document.addEventListener("DOMContentLoaded", init, false);
let status;

function init() {
  if (!navigator.onLine) {
    //statusElem = document.querySelector(".page-status");
    //statusElem.innerHTML = "offline";
    status = "offline";
  }
  else{
    //statusElem = document.querySelector(".page-status");
    //statusElem.innerHTML = "online";
    status = "online";
  }
}
