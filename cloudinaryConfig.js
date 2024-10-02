const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: 'dllerocxx',
  api_key: '524565642194249',
  api_secret: '83K0pByYX5wZHUHKdti-iYpA59M',
});

module.exports = cloudinary;