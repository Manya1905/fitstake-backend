require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }));
app.use(express.json());

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Strava OAuth Routes ────────────────────────────────────────────

// Generate Strava OAuth URL
app.get("/api/strava/auth-url", (req, res) => {
  const { redirectUri } = req.query;
  const clientId = process.env.STRAVA_CLIENT_ID;

  if (!clientId) {
    return res.status(500).json({ error: "Strava not configured" });
  }

  const url = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=activity:read_all&approval_prompt=auto`;

  res.json({ url });
});

// Exchange Strava auth code for tokens
app.post("/api/strava/token", async (req, res) => {
  try {
    const { code } = req.body;

    const response = await axios.post("https://www.strava.com/oauth/token", {
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    });

    res.json({
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresAt: response.data.expires_at,
      athlete: response.data.athlete,
    });
  } catch (error) {
    console.error("Strava token error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to exchange Strava token",
      details: error.response?.data || error.message,
    });
  }
});

// Refresh Strava access token
app.post("/api/strava/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;

    const response = await axios.post("https://www.strava.com/oauth/token", {
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });

    res.json({
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresAt: response.data.expires_at,
    });
  } catch (error) {
    console.error("Strava refresh error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to refresh Strava token" });
  }
});

// ─── Fitbit OAuth Routes ────────────────────────────────────────────

// Generate Fitbit OAuth URL
app.get("/api/fitbit/auth-url", (req, res) => {
  const { redirectUri } = req.query;
  const clientId = process.env.FITBIT_CLIENT_ID;

  if (!clientId) {
    return res.status(500).json({ error: "Fitbit not configured" });
  }

  const scopes = "activity heartrate sleep profile";
  const url = `https://www.fitbit.com/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`;

  res.json({ url });
});

// Exchange Fitbit auth code for tokens
app.post("/api/fitbit/token", async (req, res) => {
  try {
    const { code, redirectUri } = req.body;
    const clientId = process.env.FITBIT_CLIENT_ID;
    const clientSecret = process.env.FITBIT_CLIENT_SECRET;

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const response = await axios.post(
      "https://api.fitbit.com/oauth2/token",
      new URLSearchParams({
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }).toString(),
      {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    res.json({
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresIn: response.data.expires_in,
      userId: response.data.user_id,
    });
  } catch (error) {
    console.error("Fitbit token error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to exchange Fitbit token",
      details: error.response?.data || error.message,
    });
  }
});

// Refresh Fitbit access token
app.post("/api/fitbit/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const clientId = process.env.FITBIT_CLIENT_ID;
    const clientSecret = process.env.FITBIT_CLIENT_SECRET;

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const response = await axios.post(
      "https://api.fitbit.com/oauth2/token",
      new URLSearchParams({
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
      {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    res.json({
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresIn: response.data.expires_in,
    });
  } catch (error) {
    console.error("Fitbit refresh error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to refresh Fitbit token" });
  }
});

// ─── Unified Fitness Activity Route ─────────────────────────────────

// Fetch activities from any connected provider
app.get("/api/fitness/activities", async (req, res) => {
  try {
    const { provider, accessToken, startDate, endDate } = req.query;

    if (!provider || !accessToken) {
      return res.status(400).json({ error: "Missing provider or accessToken" });
    }

    let activities = [];

    if (provider === "strava") {
      const after = Math.floor(new Date(startDate).getTime() / 1000);
      const before = Math.floor(new Date(endDate).getTime() / 1000) + 86400;

      const response = await axios.get(
        "https://www.strava.com/api/v3/athlete/activities",
        {
          params: { after, before, per_page: 50 },
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      activities = response.data.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.sport_type || a.type,
        date: a.start_date_local,
        duration: a.moving_time, // seconds
        distance: a.distance, // meters
        calories: a.calories || null,
        averageHeartRate: a.average_heartrate || null,
        elevationGain: a.total_elevation_gain || null,
        link: `https://www.strava.com/activities/${a.id}`,
      }));
    } else if (provider === "fitbit") {
      const response = await axios.get(
        `https://api.fitbit.com/1/user/-/activities/list.json`,
        {
          params: {
            afterDate: startDate,
            sort: "asc",
            limit: 50,
            offset: 0,
          },
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      activities = (response.data.activities || [])
        .filter((a) => {
          const actDate = a.startDate || a.originalStartTime?.split("T")[0];
          return actDate <= endDate;
        })
        .map((a) => ({
          id: a.logId,
          name: a.activityName,
          type: a.activityName,
          date: a.startDate || a.originalStartTime,
          duration: a.activeDuration ? a.activeDuration / 1000 : null, // ms → seconds
          distance: a.distance ? a.distance * 1609.34 : null, // miles → meters
          calories: a.calories || null,
          averageHeartRate: a.averageHeartRate || null,
          steps: a.steps || null,
        }));
    }

    res.json({ activities, provider });
  } catch (error) {
    console.error("Fitness activity error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to fetch activities",
      details: error.response?.data || error.message,
    });
  }
});

// ─── Coinbase Onramp Routes ─────────────────────────────────────────

app.post("/api/onramp/session", async (req, res) => {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress) {
      return res.status(400).json({ error: "Missing walletAddress" });
    }

    const config = {
      appId: process.env.COINBASE_PROJECT_ID,
      addresses: { [walletAddress]: ["base"] },
      assets: ["USDC"],
      defaultNetwork: "base",
      defaultAsset: "USDC",
    };

    const params = new URLSearchParams({
      appId: config.appId,
      addresses: JSON.stringify(config.addresses),
      assets: JSON.stringify(config.assets),
      defaultNetwork: config.defaultNetwork,
      defaultAsset: config.defaultAsset,
    });

    const onrampUrl = `https://pay.coinbase.com/buy/select-asset?${params.toString()}`;

    res.json({ url: onrampUrl });
  } catch (error) {
    console.error("Onramp session error:", error.message);
    res.status(500).json({ error: "Failed to generate onramp session" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`FitStake backend running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
