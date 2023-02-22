const app = require("./app");

const port = 3000;

app.listen(port, () => {
  try {
    console.info(`listening at http://localhost:${port}`);
  } catch (error) {
    console.error(error);
  }
});
