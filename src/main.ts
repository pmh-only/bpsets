import { S3BucketVersioningEnabled } from "./bpsets/s3/S3BucketVersioningEnabled";

new S3BucketVersioningEnabled()
  .check()
  .then(({ nonCompliantResources }) => {
    new S3BucketVersioningEnabled()
      .fix(nonCompliantResources, [])
      .then(() => console.log('Done'))
  })
