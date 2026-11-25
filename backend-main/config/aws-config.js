const AWS = require("aws-sdk");

AWS.config.update({ region: process.env.AWS_REGION || "ap-south-1" });

const s3 = new AWS.S3();
// FIX: bucket comes from .env instead of the "insert_bucket_name" placeholder
const S3_BUCKET = process.env.S3_BUCKET;

module.exports = { s3, S3_BUCKET };
