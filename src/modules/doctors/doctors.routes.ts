import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/async-handler";
import {
  createDoctorSchema,
  createSlotSchema,
  doctorIdParam,
  searchDoctorsSchema,
  updateDoctorSchema,
  updateSlotSchema,
} from "./doctors.schemas";
import * as doctorsService from "./doctors.service";

export const doctorsRouter = Router();

doctorsRouter.get(
  "/",
  validate(searchDoctorsSchema),
  asyncHandler(async (req, res) => {
    const result = await doctorsService.searchDoctors(
      req.query as {
        specialization?: string;
        availableFrom?: string;
        availableTo?: string;
        page?: string;
        pageSize?: string;
      },
    );
    res.json(result);
  }),
);

doctorsRouter.get(
  "/me",
  authenticate,
  authorize("DOCTOR", "ADMIN"),
  asyncHandler(async (req, res) => {
    const doctor = await doctorsService.getDoctorByUserId(req.user!.id);
    res.json(doctor);
  }),
);

doctorsRouter.patch(
  "/me",
  authenticate,
  authorize("DOCTOR"),
  validate(updateDoctorSchema),
  asyncHandler(async (req, res) => {
    const doctor = await doctorsService.updateOwnDoctor(
      req.user!,
      req.body as {
        specialization?: string;
        bio?: string | null;
        consultationFee?: number;
        fullName?: string;
        phone?: string | null;
      },
    );
    res.json(doctor);
  }),
);

doctorsRouter.get(
  "/me/availability",
  authenticate,
  authorize("DOCTOR"),
  asyncHandler(async (req, res) => {
    const doctor = await doctorsService.getDoctorByUserId(req.user!.id);
    const slots = await doctorsService.listAvailability(doctor.id, true);
    res.json({ items: slots });
  }),
);

doctorsRouter.post(
  "/me/availability",
  authenticate,
  authorize("DOCTOR"),
  validate(createSlotSchema),
  asyncHandler(async (req, res) => {
    const slot = await doctorsService.createAvailability(
      req.user!,
      req.body as { startsAt: string; endsAt: string },
      req.requestId,
    );
    res.status(201).json(slot);
  }),
);

doctorsRouter.patch(
  "/me/availability/:slotId",
  authenticate,
  authorize("DOCTOR", "ADMIN"),
  validate(updateSlotSchema),
  asyncHandler(async (req, res) => {
    const slot = await doctorsService.updateAvailability(
      req.user!,
      req.params.slotId as string,
      req.body as {
        startsAt?: string;
        endsAt?: string;
        status?: "AVAILABLE" | "BLOCKED";
      },
      req.requestId,
    );
    res.json(slot);
  }),
);

doctorsRouter.get(
  "/:id",
  validate(doctorIdParam),
  asyncHandler(async (req, res) => {
    const doctor = await doctorsService.getDoctorById(req.params.id as string);
    res.json(doctor);
  }),
);

doctorsRouter.get(
  "/:id/availability",
  validate(doctorIdParam),
  asyncHandler(async (req, res) => {
    const slots = await doctorsService.listAvailability(req.params.id as string);
    res.json({ items: slots.filter((slot) => slot.status === "AVAILABLE") });
  }),
);

export const adminDoctorsRouter = Router();

adminDoctorsRouter.post(
  "/",
  authenticate,
  authorize("ADMIN"),
  validate(createDoctorSchema),
  asyncHandler(async (req, res) => {
    const doctor = await doctorsService.createDoctor(
      req.body as {
        email: string;
        password: string;
        fullName: string;
        specialization: string;
        licenseNumber: string;
        consultationFee: number;
        bio?: string;
        phone?: string;
      },
      req.user!,
      req.requestId,
    );
    res.status(201).json(doctor);
  }),
);

adminDoctorsRouter.post(
  "/:id/verify",
  authenticate,
  authorize("ADMIN"),
  validate(doctorIdParam),
  asyncHandler(async (req, res) => {
    const doctor = await doctorsService.verifyDoctor(
      req.params.id as string,
      req.user!,
      req.requestId,
    );
    res.json(doctor);
  }),
);
