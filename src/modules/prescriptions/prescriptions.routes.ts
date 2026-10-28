import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/async-handler";
import {
  createPrescriptionSchema,
  prescriptionIdParam,
} from "./prescriptions.schemas";
import * as prescriptionsService from "./prescriptions.service";

export const consultationPrescriptionsRouter = Router({ mergeParams: true });

consultationPrescriptionsRouter.post(
  "/",
  authenticate,
  authorize("DOCTOR", "ADMIN"),
  validate(createPrescriptionSchema),
  asyncHandler(async (req, res) => {
    const result = await prescriptionsService.createPrescription(
      req.user!,
      req.params.id as string,
      req.body as {
        diagnosis: string;
        medications: unknown[];
        instructions?: string;
      },
      req.requestId,
    );
    res.status(201).json(result);
  }),
);

consultationPrescriptionsRouter.get(
  "/",
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await prescriptionsService.getPrescriptionForConsultation(
      req.user!,
      req.params.id as string,
    );
    res.json(result);
  }),
);

export const prescriptionsRouter = Router();

prescriptionsRouter.get(
  "/:id",
  authenticate,
  validate(prescriptionIdParam),
  asyncHandler(async (req, res) => {
    const result = await prescriptionsService.getPrescriptionById(
      req.user!,
      req.params.id as string,
    );
    res.json(result);
  }),
);
