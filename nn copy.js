const puppeteer = require('puppeteer');
const AWS = require('aws-sdk');
const fs = require('fs');
// const Redis = require('ioredis');

// // Connect to Redis using environment variables
// const redis = new Redis({
//     host: process.env.REDIS_HOST || 'localhost',
//     port: process.env.REDIS_PORT || 6379
//   });

const credentials = {
  accessKeyId: 'AKIAY3PDJJIWNSLC3EEO',
  secretAccessKey: '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',
  region: 'us-east-1'
};
 
// Set the AWS region
AWS.config.update({ credentials });


// Create an S3 service object
const s3 = new AWS.S3();

const bucketName = 'tokens-puppeteer-bucket';
const keyName = './keys.txt';


(async () => {
  const browser = await puppeteer.launch({ 
    headless: true,
    // args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-setuid-sandbox"],
    // ignoreDefaultArgs: ["--disable-extensions"],
    // executablePath: "/usr/bin/google-chrome",
   }); // Launch browser in non-headless mode for visibility
  const page = await browser.newPage();

  try {
    // Navigate to the initial page
    await page.goto('https://token.unlocks.app/');

    // Function to read content from the current page
    const readContent = async () => {
      const data = await page.evaluate(() => {
        const tds = Array.from(document.querySelectorAll('table.table-auto tr td'))
        return tds.map(td => td.innerText)
      });

      // split array to smaller arraies
      const tokensArr = chunk(data, 9);
      // Set up the parameters for the S3 API call
      const params = {
        Bucket: bucketName,
        Key: keyName,
        Body: tokensArr
      };
      uploadS3(params);

      //addTokens(tokensArr);
      //console.log('Content from the current page:', tokensArr);
    };

    // Define a flag to keep track of pagination state
    let isNextButtonEnabled = true;

    // Loop until the next button is disabled
    while (isNextButtonEnabled) {
      // Read content from the current page
      await readContent();

      // Introduce a delay of 5 seconds (optional)
      //await delay(5000);

      isNextButtonEnabled = await page.evaluate(() => {
        // Use XPath to locate the button element by its text content
        const button = document.evaluate("//button[contains(text(),'Next')]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        return button && !button.disabled;
      });

      // If next button is enabled, click it
      if (isNextButtonEnabled) {
        // Click on pagination to navigate to the next page
        const nextPageButtonSelector = '.border-2.border-black-background button ::-p-text("Next")'; // Replace this with the selector for the pagination button
        await page.waitForSelector(nextPageButtonSelector);
        await page.click(nextPageButtonSelector);

        // Wait for navigation to complete
        //await page.waitForNavigation({ waitUntil: 'domcontentloaded' });
        await page.waitForNetworkIdle();
      }
    }
  } catch (error) {
    console.error('Error occurred:', error);
  } finally {
    await browser.close();
  }
})();

// Function to introduce delay
function delay(time) {
  return new Promise(resolve => setTimeout(resolve, time));
}

const chunk = (arr, size) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );

const addTokens = (arr) => {
    arr.map(t => {
        insertToken(t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8])
            .then(() => console.log('Token inserted successfully'))
            .catch(err => console.error('Error inserting Token:', err));
    });
}

// Function to insert user data into Redis
async function insertToken(name, price, h24, m_cap, cir_supply, total_unlocked, upcoming_unlock, next_7d_emission) {
    await redis.hmset(
        `token:${name}`, 
        'price', price, 
        'h24', h24, 
        'm_cap', m_cap, 
        'cir_supply', cir_supply,
        'total_unlocked', total_unlocked,
        'upcoming_unlock', upcoming_unlock,
        'next_7d_emission', next_7d_emission
        );
  }

function uploadS3(params) {
  // Upload data to S3
  s3.upload(params, (err, data) => {
    if (err) {
      console.error('Error uploading data to S3:', err);
    } else {
      console.log('Successfully uploaded data to S3:', data.Location);
    }
  });
}