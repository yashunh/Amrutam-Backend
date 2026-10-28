import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/async-handler";
import { consultationIdParam, statusSchema } from "./consultations.schemas";
import * as consultationsService from "./consultations.service";

export const consultationsRouter = Router();

consultationsRouter.get(
  "/:id",
  authenticate,
  validate(consultationIdParam),
  asyncHandler(async (req, res) => {
    const result = await consultationsService.getConsultation(
      req.user!,
      req.params.id as string,
    );
    res.json(result);
  }),
);

consultationsRouter.patch(
  "/:id/status",
  authenticate,
  authorize("DOCTOR", "ADMIN"),
  validate(statusSchema),
  asyncHandler(async (req, res) => {
    const result = await consultationsService.transitionStatus(
      req.user!,
      req.params.id as string,
      (req.body as { status: "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "NO_SHOW" })
        .status,
      req.requestId,
    );
    res.json(result);
  }),
);
