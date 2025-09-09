const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "localhost",
  port: 25,
  secure: false,
  auth: {
    user: "usesend",
    pass: "us_123",
  },
  tls: {
    rejectUnauthorized: false,
  },
});

const mailOptions = {
  to: "sender@example.com",
  from: "hello@example.com",
  subject: "Testing SMTP",
  html: "<strong>THIS IS USING SMTP,</strong><p>useSend is the best open source sending platform<p><p>check out <a href='https://usesend.com'>usesend.com</a>",
  text: "hello,\n\nuseSend is the best open source sending platform",
};

transporter.sendMail(mailOptions, (error, info) => {
  if (error) {
    console.error("Error sending email:", error);
  } else {
    console.log("Email sent successfully:", info.response);
  }
});
