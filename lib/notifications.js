import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, Timestamp } from "firebase/firestore";
import { db } from "./firebase";
import { SITE_NAME } from "./utils";

export const ensureUserInFirestore = async (user) => {
  if (!user) return;
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      name: user.displayName || "User",
      email: user.email || "",
      photoUrl: user.photoURL || "",
      isAdmin: false,
      userType: "customer",
      createdAt: Timestamp.now(),
      lastLogin: Timestamp.now(),
      fcmToken: "",
    });
  } else {
    await updateDoc(ref, { lastLogin: Timestamp.now() });
  }
};

export const sendMail = async (to, subject, body, isHtml = false) => {
  try {
    const res = await fetch("/api/send-mail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, body, isHtml }),
    });
    if (!res.ok) console.warn("Mail sending failed");
    return res.ok;
  } catch (e) {
    console.warn("Mail error:", e);
    return false;
  }
};

export const sendFCM = async (tokens, title, body, data = {}) => {
  if (!tokens || tokens.length === 0) return;
  try {
    const res = await fetch("/api/send-fcm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokens, title, body, data }),
    });
    if (!res.ok) console.warn("FCM sending failed");
  } catch (e) {
    console.warn("FCM error:", e);
  }
};

export const getAdmins = async () => {
  try {
    const q = query(collection(db, "users"), where("isAdmin", "==", true));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn("Failed to get admins:", e);
    return [];
  }
};

export const getAdminTokens = async () => {
  const admins = await getAdmins();
  return admins.map((a) => a.fcmToken).filter(Boolean);
};

export const notifyAdminsSignIn = async (user) => {
  const tokens = await getAdminTokens();
  await sendFCM(tokens, "🔔 New User Sign In", `${user.displayName || user.email} just signed in to Ween.`);
};

export const sendWelcomeMail = async (user) => {
  await sendMail(
    user.email,
    `🎉 Welcome to ${SITE_NAME}!`,
    `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa; border-radius: 12px;">
        <div style="text-align: center; padding: 20px 0;">
          <img src="https://samruddhiindustries.netlify.app/logo.png" alt="${SITE_NAME}" style="height: 60px;"/>
          <h2 style="color: #0E3F7A; margin-top: 10px;">Welcome to ${SITE_NAME}! 🎉</h2>
        </div>
        <div style="background: white; padding: 25px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
          <p style="font-size: 16px; color: #333;">Hi <strong>${user.displayName || "there"}</strong>,</p>
          <p style="color: #555;">Thank you for signing up with ${SITE_NAME}! 🛍️</p>
          <p style="color: #555;">Start exploring our premium household products and enjoy:</p>
          <ul style="color: #555; padding-left: 20px;">
            <li>✅ Premium quality products</li>
            <li>✅ Honest, fair prices</li>
            <li>✅ Fast delivery across India</li>
            <li>✅ Secure payments</li>
          </ul>
          <p style="color: #555; margin-top: 15px;">Happy shopping! ❤️</p>
        </div>
        <div style="text-align: center; padding: 15px; color: #888; font-size: 12px;">
          <p>${SITE_NAME}</p>
          <p>AB Road, Shajapur, MP</p>
        </div>
      </div>
    `,
    true
  );
};

export const notifyAdminsOrder = async (orderData, userEmail, userName) => {
  await sendMail(
    userEmail,
    `✅ Order Confirmed – ${SITE_NAME}`,
    `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa; border-radius: 12px;">
        <div style="text-align: center; padding: 20px 0;">
          <img src="https://samruddhiindustries.netlify.app/logo.png" alt="${SITE_NAME}" style="height: 60px;"/>
          <h2 style="color: #0E3F7A; margin-top: 10px;">Order Confirmed! 🎉</h2>
        </div>
        <div style="background: white; padding: 25px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
          <p style="font-size: 16px; color: #333;">Hi <strong>${userName}</strong>,</p>
          <p style="color: #555;">Your order <strong>#${orderData.orderId}</strong> has been placed successfully!</p>
          <div style="background: #f0f4f8; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <p style="margin: 5px 0;"><strong>Total Amount:</strong> ₹${orderData.totalAmount.toLocaleString()}</p>
            <p style="margin: 5px 0;"><strong>Payment:</strong> ${orderData.paymentMethod.toUpperCase()}</p>
            <p style="margin: 5px 0;"><strong>Delivery:</strong> ${orderData.deliveryAddress.street}, ${orderData.deliveryAddress.city}</p>
          </div>
          <p style="color: #555;">We'll notify you once your order is shipped.</p>
          <p style="color: #555; margin-top: 15px;">Thank you for shopping with ${SITE_NAME}! ❤️</p>
        </div>
        <div style="text-align: center; padding: 15px; color: #888; font-size: 12px;">
          <p>${SITE_NAME}</p>
          <p>AB Road, Shajapur, MP</p>
        </div>
      </div>
    `,
    true
  );

  const admins = await getAdmins();
  for (const admin of admins) {
    if (admin.email) {
      await sendMail(
        admin.email,
        `🛍️ New Order Placed – ${SITE_NAME}`,
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa; border-radius: 12px;">
            <div style="text-align: center; padding: 20px 0;">
              <img src="https://samruddhiindustries.netlify.app/logo.png" alt="${SITE_NAME}" style="height: 60px;"/>
              <h2 style="color: #0E3F7A; margin-top: 10px;">🛍️ New Order Received!</h2>
            </div>
            <div style="background: white; padding: 25px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
              <div style="background: #e3ecf3; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <p style="margin: 3px 0;"><strong>Order ID:</strong> #${orderData.orderId}</p>
                <p style="margin: 3px 0;"><strong>Customer:</strong> ${userName} (${userEmail})</p>
                <p style="margin: 3px 0;"><strong>Amount:</strong> ₹${orderData.totalAmount.toLocaleString()}</p>
                <p style="margin: 3px 0;"><strong>Payment:</strong> ${orderData.paymentMethod.toUpperCase()}</p>
              </div>
              <h4 style="color: #333; margin-bottom: 10px;">Items:</h4>
              ${orderData.items
                .map(
                  (item) => `
                <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #eee;">
                  <span>${item.productName} × ${item.quantity}</span>
                  <span>₹${item.total.toLocaleString()}</span>
                </div>
              `
                )
                .join("")}
              <div style="display: flex; justify-content: space-between; padding: 10px 0; font-weight: bold; font-size: 16px; border-top: 2px solid #0E3F7A; margin-top: 10px;">
                <span>Total</span>
                <span style="color: #0E3F7A;">₹${orderData.totalAmount.toLocaleString()}</span>
              </div>
              <div style="margin-top: 15px; background: #f0f4f8; padding: 10px; border-radius: 8px;">
                <p style="margin: 3px 0; font-size: 14px;"><strong>📍 Delivery Address:</strong></p>
                <p style="margin: 3px 0; font-size: 13px; color: #555;">${orderData.deliveryAddress.street}, ${orderData.deliveryAddress.city}, ${orderData.deliveryAddress.state} - ${orderData.deliveryAddress.pincode}</p>
              </div>
            </div>
            <div style="text-align: center; padding: 15px; color: #888; font-size: 12px;">
              <p>${SITE_NAME}</p>
              <p>AB Road, Shajapur, MP</p>
            </div>
          </div>
        `,
        true
      );
    }
    if (admin.fcmToken) {
      await sendFCM(
        [admin.fcmToken],
        "🛍️ New Order Placed",
        `Order #${orderData.orderId} by ${userName} for ₹${orderData.totalAmount.toLocaleString()}`
      );
    }
  }
};
