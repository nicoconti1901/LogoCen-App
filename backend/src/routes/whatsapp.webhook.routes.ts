import { Router } from "express";
import express from "express";
import * as whatsappController from "../controllers/whatsapp.controller.js";

export const whatsappWebhookRouter = Router();

whatsappWebhookRouter.use(express.raw({ type: "application/json" }));

whatsappWebhookRouter.get("/", whatsappController.metaWebhookVerify);
whatsappWebhookRouter.post("/", whatsappController.metaWebhookReceive);
