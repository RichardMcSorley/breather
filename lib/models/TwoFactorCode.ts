import mongoose from "mongoose";

const TwoFactorCodeSchema = new mongoose.Schema({
  provider: { type: String, required: true, index: true },
  code: { type: String, required: true },
  raw_text: { type: String, required: true },
  expires_at: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  created_at: { type: Date, default: Date.now },
});

export default mongoose.models.TwoFactorCode ||
  mongoose.model("TwoFactorCode", TwoFactorCodeSchema);
