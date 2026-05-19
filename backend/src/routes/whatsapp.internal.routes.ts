import { Router } from "express";
import * as whatsappController from "../controllers/whatsapp.controller.js";

export const whatsappInternalRouter = Router();

whatsappInternalRouter.post("/reminders/run", whatsappController.runRemindersCron);
