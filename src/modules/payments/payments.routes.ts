import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/async-handler";
import { paymentIdParam, simulatePaymentSchema } from "./payments.schemas";
import * as paymentsService from "./payments.service";

export const paymentsRouter = Router();

paymentsRouter.get(
  "/:id",
  authenticate,
  validate(paymentIdParam),
  asyncHandler(async (req, res) => {
    const result = await paymentsService.getPayment(
      req.user!,
      req.params.id as string,
    );
    res.json(result);
  }),
);

paymentsRouter.post(
  "/:id/simulate",
  authenticate,
  validate(simulatePaymentSchema),
  asyncHandler(async (req, res) => {
    const result = await paymentsService.simulatePayment(
      req.user!,
      req.params.id as string,
      req.body as { outcome: "SUCCEEDED" | "FAILED"; providerReference?: string },
      req.requestId,
    );
    res.json(result);
  }),
);
