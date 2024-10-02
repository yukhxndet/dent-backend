const express = require("express");
const app = express();
const mongoose = require("mongoose");
const bcrypt = require('bcryptjs');
const bodyParser = require("body-parser");
const cors = require("cors");
const jwt = require('jsonwebtoken');
const UserDetails = require("./UserDetails"); 
const Treatment = require("./treatmentList");
const cloudinary = require('./cloudinaryConfig');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const axios = require('axios');
const dialogflow = require('dialogflow');
const uuid = require('uuid');
const path = require('path'); 

app.use(cors());
app.use(bodyParser.json());

const mongoURL = "mongodb+srv://yukhondett:wSO0AB1orzj4S6K8@cluster0.pnhp5ov.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const JWT_SECRET = "$2a$10$htVXI5fb8iQMjCrQKln/0eu/vKK92Ahctmpzid6DpYR11ufqUO3tW";

mongoose.connect(mongoURL)
  .then(() => {
    console.log("Database Connected");
  })
  .catch((e) => {
    console.log(e);
  });

const User = mongoose.model("User");

app.get("/", (req, res) => {
  res.send("Hello world");
});

app.post('/login', async (req, res) => {
  const { email, password, platform } = req.body;
  const oldUser = await User.findOne({ email: email });

  if (!oldUser) {
    return res.status(400).send({ status: 'error', data: "User doesn't exist" });
  }

  // ตรวจสอบว่า user มี status เป็น '0' และห้ามเข้าถึง Web App
  if (platform === 'web' && oldUser.status === '0') {
    return res.status(403).send({ status: 'error', data: 'Unauthorized to access web app' });
  }

  const isPasswordMatch = await bcrypt.compare(password, oldUser.password);
  
  if (isPasswordMatch) {
    const token = jwt.sign({ email: oldUser.email }, JWT_SECRET);
    return res.status(201).send({
      status: 'ok',
      data: token,
      userType: oldUser.userType,
    });
  } else {
    return res.status(400).send({ status: 'error', data: 'Invalid credentials' });
  }
});



app.post('/userdata', async (req, res) => {
  const { token } = req.body;
  try {
    const user = jwt.verify(token, JWT_SECRET);
    const useremail = user.email;

    User.findOne({ email: useremail }).then((data) => {
      return res.send({ status: 'OK', data: data });
    });
  } catch (error) {
    return res.send({ error: "error" });
  }
});

app.post('/add-treatments', async (req, res) => {
  try {
    const treatments = await fetchTreatmentsFromOtherSource();
    await Treatment.insertMany(treatments);
    res.status(201).send('Treatments added successfully');
  } catch (error) {
    console.error('Error adding treatments:', error);
    res.status(500).send('Error adding treatments');
  }
});

app.get('/get-treatments', async (req, res) => {
  try {
    const treatments = await Treatment.find();
    res.json(treatments);
  } catch (error) {
    res.status(500).send('Error fetching treatments');
  }
});

const dateTimeSchema = new mongoose.Schema({
  date: Date,
  availableTimes: [{
    time: String,
    status: String
  }]
}, { collection: 'DateTime' });

const DateTime = mongoose.model('DateTime', dateTimeSchema);

// app.get('/get-available-times', async (req, res) => {
//   try {
//     const availableTimes = await DateTime.find().lean();


//     const filteredTimes = availableTimes.map(dateTime => ({
//       date: dateTime.date,
//       availableTimes: dateTime.availableTimes.filter(timeSlot => timeSlot.status === "1")
//     }));

//     res.json(filteredTimes);
//   } catch (error) {
//     res.status(500).send('Error fetching available times');
//   }
// });

app.get('/get-available-times', async (req, res) => {
  const { dentistID, date } = req.query;

  if (!dentistID || !date) {
    return res.status(400).json({ message: 'Missing required query parameters: dentistID and date.' });
  }

  try {
    const selectedDate = new Date(date);
    const month = selectedDate.getMonth() + 1; // เดือนเริ่มจาก 0
    const year = selectedDate.getFullYear();

    // ค้นหา DentistSchedule ที่ตรงกับ dentistID, เดือน, ปี และวันที่ต้องการ
    const schedule = await DentistSchedule.findOne({
      dentistID: dentistID,
      month: month.toString(),
      year: year.toString(),
      "workingDays.date": selectedDate,
    }).lean();

    if (!schedule) {
      return res.status(404).json({ message: 'No schedule found for the selected date.' });
    }

    // หา workingDay ที่ตรงกับวันที่เลือก
    const workingDay = schedule.workingDays.find(wd => {
      return new Date(wd.date).toDateString() === selectedDate.toDateString();
    });

    if (!workingDay) {
      return res.status(404).json({ message: 'No working day found.' });
    }

    // กรองเวลาให้เหลือเฉพาะเวลาที่ว่าง
    const availableTimes = workingDay.availableTimes.filter(timeSlot => timeSlot.status === "1");

    res.json({ availableTimes: availableTimes });
  } catch (error) {
    console.error('Error fetching available times:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


const appointmentSchema = new mongoose.Schema({
  userID: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  treatmentID: { type: [mongoose.Schema.Types.ObjectId], ref: 'Treatment', required: true },
  dateTime: { type: String, required: true },
  totalPrice: { type: Number, default: 0 },
  status: { type: String, default: 'กำลังพิจารณา' },
  deletedAt: { type: Date, default: null }
}, {
  collection: 'Appointment',
  timestamps: true
});

const Appointment = mongoose.model('Appointment', appointmentSchema);

app.get('/api/appointments', async (req, res) => {
  try {
    const appointments = await Appointment.find({ deletedAt: null }); // Fetch only active appointments
    res.json(appointments);
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).send('Error fetching appointments');
  }
});

/*
app.post('/api/appointments', async (req, res) => {
  const { userID, treatmentID, dateTime, totalPrice } = req.body;

  if (!userID || !treatmentID || !dateTime) {
    return res.status(400).json({ message: 'ฟิวที่ส่งมาหาย'})
  }
  try {
    const newAppointment = new Appointment({
      userID,
      treatmentID,
      dateTime,
      totalPrice,
    });

    await newAppointment.save();

    // อัปเดต slot ที่จองแล้วใน DentistSchedule
    const dateObj = new Date(dateTime);
    const datePart = dateObj.toISOString().split('T')[0];
    const timePart = dateObj.toISOString().split('T')[1].split(':00.000Z')[0];

    await DentistSchedule.updateOne(
      { "workingDays.date": new Date(datePart), "workingDays.availableTimes.time": timePart },
      { $set: { "workingDays.$.availableTimes.$.status": "0" } }
    );

    res.status(201).json({ message: 'Appointment created successfully', appointment: newAppointment });
  } catch (error) {
    console.error('Error creating appointment:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});
*/
app.post('/api/appointments', async (req, res) => {
  const { treatmentID, dateTime, dentistID, totalPrice } = req.body;

  console.log('Received data:', req.body); // เพิ่มการตรวจสอบ LOG

  if (!treatmentID || !dateTime || !dentistID) {
    return res.status(400).json({ message: 'Missing required fields.' });
  }

  try {
    // ตรวจสอบว่าทันตแพทย์มีอยู่
    const dentist = await Dentist.findById(dentistID);
    if (!dentist) {
      return res.status(404).json({ message: 'Dentist not found.' });
    }

    // ตรวจสอบ Treatments ว่ามีอยู่จริง
    const treatments = await Treatment.find({ _id: { $in: treatmentID } });
    if (treatments.length !== treatmentID.length) {
      return res.status(400).json({ message: 'One or more treatments are invalid.' });
    }

    // สร้างนัดหมายใหม่
    const newAppointment = new Appointment({
      userID: req.user.id, // ใช้ user จาก token
      treatmentID,
      dateTime: new Date(dateTime),
      dentistID,
      totalPrice,
    });

    await newAppointment.save();

    // อัปเดตสถานะเวลาใน DentistSchedule
    const dateObj = new Date(dateTime);
    const datePart = dateObj.toISOString().split('T')[0];
    const timePart = dateObj.toTimeString().substring(0, 5); // "HH:MM"

    const dentistSchedule = await DentistSchedule.findOne({
      dentistID: dentistID,
      month: (dateObj.getMonth() + 1).toString(),
      year: dateObj.getFullYear().toString(),
      "workingDays.date": new Date(datePart),
    });

    if (dentistSchedule) {
      const workingDay = dentistSchedule.workingDays.find(wd => {
        return new Date(wd.date).toDateString() === dateObj.toDateString();
      });

      if (workingDay) {
        const timeSlot = workingDay.availableTimes.find(at => at.time === timePart);
        if (timeSlot) {
          timeSlot.status = "0"; // เปลี่ยนสถานะเป็นจองแล้ว
          await dentistSchedule.save();
        }
      }
    }

    res.status(201).json({ message: 'Appointment requested successfully', appointment: newAppointment });
  } catch (error) {
    console.error('Error creating appointment:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


  


app.delete('/api/appointments/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await Appointment.findByIdAndUpdate(
      id,
      { deletedAt: new Date() },
      { new: true }
    );

    if (!result) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    res.json({ message: 'Appointment marked as deleted', appointment: result });
  } catch (error) {
    console.error('Error marking appointment as deleted:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/appointments/user', async (req, res) => {
  const { userID, token } = req.body;

  try {
    const appointments = await Appointment.find({ userID, deletedAt: null });
    res.json(appointments);
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).send('Error fetching appointments');
  }
});

app.get('/api/treatment/:id', async (req, res) => {
  try {
    const treatment = await Treatment.findById(req.params.id);
    if (!treatment) {
      return res.status(404).send('Treatment not found');
    }
    res.json(treatment);
  } catch (error) {
    console.error('Error fetching treatment:', error);
    res.status(500).send('Error fetching treatment');
  }
});

app.get('/api/user/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).send('User not found');
    }
    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).send('Error fetching user');
  }
});

const multer = require('multer');
const { time } = require("console");

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'profile_pictures',
    format: async (req, file) => 'jpeg',
    public_id: (req, file) => Date.now(),
  },
});

const upload = multer({ storage: storage });

app.post('/signup', upload.single('profilePic'), async (req, res) => {
  const { name, birthDay, gender, tel, email, password } = req.body;
  const profilePic = req.file ? req.file.path : null;

  if (!name || !birthDay || !gender || !tel || !email || !password) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  try {
    const oldUser = await UserDetails.findOne({ email });
    if (oldUser) return res.status(409).json({ error: 'User already exists.' });

    const saltRounds = 10;
    const encryptedPassword = await bcrypt.hash(password, saltRounds);

    const user = await UserDetails.create({
      name,
      birthDay,
      gender,
      tel,
      email,
      password: encryptedPassword,
      profilePic,
    });

    const token = jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: '24h' });

    res.status(201).json({ user, token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

const sessionClient = new dialogflow.SessionsClient({
  keyFilename: 'studiodentalassistant-mqj9-ee2e1bb2b29c.json' 
});

const projectId = 'studiodentalassistant-mqj9'; 

async function runSample() {
  const sessionId = uuid.v4();
  const sessionPath = sessionClient.sessionPath(projectId, sessionId);

  const request = {
    session: sessionPath,
    queryInput: {
      text: {
        text: 'สวัสดีครับ',
        languageCode: 'th',
      },
    },
  };

  try {
    const responses = await sessionClient.detectIntent(request);
    const result = responses[0].queryResult;
    console.log(`Detected intent: ${result.intent.displayName}`);
    console.log(`Fulfillment text: ${result.fulfillmentText}`);
  } catch (error) {
    console.error('ERROR:', error);
  }
}

runSample();

app.post('/chat', async (req, res) => {
  const { message } = req.body;

  const sessionId = uuid.v4(); 

  const sessionPath = sessionClient.sessionPath(projectId, sessionId);

  const request = {
    session: sessionPath,
    queryInput: {
      text: {
        text: message,
        languageCode: 'th',
      },
    },
  };

  try {
    const responses = await sessionClient.detectIntent(request);
    const result = responses[0].queryResult;

    res.json({
      response: result.fulfillmentText,
    });
  } catch (error) {
    console.error('Error processing message:', error);
    res.status(500).send('Error processing message');
  }
});

// app.get('/get-dentist-schedule/:dentistID', async (req, res) => {
//   const { dentistID } = req.params;
//   try {
//     const schedule = await DentistSchedule.find({ dentistID }).lean();
//     res.json(schedule);
//   } catch (error) {
//     res.status(500).send('Error fetching dentist schedule');
//   }
// });

app.get('/get-dentist-schedule/:dentistID', async (req, res) => {
  const { dentistID } = req.params;
  try {
    const schedule = await DentistSchedule.find({ dentistID }).lean();
    if (!schedule || schedule.length === 0) {
      return res.status(404).json({ message: 'No schedule found for the given dentistID.' });
    }
    res.json(schedule);
  } catch (error) {
    console.error('Error fetching dentist schedule:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});




app.listen(5001, () => {
  console.log("Node.js server has started on port 5001");
});
