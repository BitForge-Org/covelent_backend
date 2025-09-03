import Razorpay from 'razorpay';
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID, // from Razorpay dashboard
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

export default razorpay;
