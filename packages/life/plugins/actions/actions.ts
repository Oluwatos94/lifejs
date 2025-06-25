interface Action {
  location: "server" | "client";
  behavior: "blocking" | "non-blocking";
}
