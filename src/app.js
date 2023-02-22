const express = require("express");
const cors = require("cors");

const taxCalculationRoute = require("./routes/TaxCalculationRoute.js");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

app.use("/", taxCalculationRoute);

module.exports = app;
