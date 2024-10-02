const mongoose=require("mongoose")

const UserDetailSchema = new mongoose.Schema({
    name:String,
    birthDay:Date,
    gender:String,
    tel:String,
    email:{type: String, unique: true},
    password:String,
    profilePic:String,
},{
    collection: "User" ,
    timestamps: true
});

module.exports = mongoose.model("User", UserDetailSchema);