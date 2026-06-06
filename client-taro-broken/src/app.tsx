import React from "react";
import { AppProvider } from "./context/AppContext";
import "./app.scss";

function App({ children }) {
  return <AppProvider>{children}</AppProvider>;
}

export default App;
