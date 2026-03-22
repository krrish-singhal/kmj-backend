import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config/env.js";
import { USER_ROLES } from "../utils/constants.js";
import { createFirestoreModel } from "../db/firestore/model.js";
import { COLLECTIONS } from "../db/firestore/collectionNames.js";

const User = createFirestoreModel({
  modelName: "User",
  collectionName: COLLECTIONS.users,
  defaultExcludeFields: ["password", "refreshToken"],
  statics: {
    async findByCredentials(email, password) {
      const user = await this.findOne({ email, isActive: true }).select(
        "+password",
      );
      if (!user) throw new Error("Invalid credentials");
      const ok = await bcrypt.compare(password, user.password);
      if (!ok) throw new Error("Invalid credentials");
      return user;
    },
  },
  methods: {
    async comparePassword(candidatePassword) {
      return bcrypt.compare(candidatePassword, this.password);
    },

    generateAccessToken() {
      return jwt.sign(
        {
          id: this._id,
          username: this.username,
          email: this.email,
          role: this.role,
        },
        config.jwt.secret,
        { expiresIn: config.jwt.expire },
      );
    },

    generateRefreshToken() {
      return jwt.sign({ id: this._id }, config.jwt.refreshSecret, {
        expiresIn: config.jwt.refreshExpire,
      });
    },

    changedPasswordAfter(JWTTimestamp) {
      if (this.passwordChangedAt) {
        const changedTimestamp = parseInt(
          new Date(this.passwordChangedAt).getTime() / 1000,
          10,
        );
        return JWTTimestamp < changedTimestamp;
      }
      return false;
    },

    // Keep role defaults consistent with previous Mongoose schema
    normalizeDefaults() {
      if (!this.role) this.role = USER_ROLES.USER;
      if (this.isActive === undefined) this.isActive = true;
      if (this.profileComplete === undefined) this.profileComplete = false;
    },
  },
});

export default User;
