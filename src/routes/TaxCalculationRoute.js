const { Router } = require("express");

const {
  calculateTaxFromAvalara,
} = require("../services/TaxCalculationService");
const constants = require("../constants");

const router = Router();

router.post(constants.TAX_CALCULATION_ENDPOINT, async (req, res) => {
  try {
    const response = await calculateTaxFromAvalara(req.body);

    return res.json(response);
  } catch (error) {
    res.statusMessage = error?.message;
    res.status(400).end();
  }
});

module.exports = router;
