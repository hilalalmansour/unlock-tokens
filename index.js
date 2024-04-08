const puppeteer = require('puppeteer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { Readable } = require('stream');
const { Upload } = require('@aws-sdk/lib-storage');

// AWS credentials (for demonstration purposes only; do not hard-code in production)
const awsCredentials = {
  accessKeyId: 'AKIAY3PDJJIWNSLC3EEO',
  secretAccessKey: 'mwozA3kiD19wH6I44IpNGndZx/ABpNkbiKk7YEiR',
  region: 'us-east-1' // Specify your AWS region
};

(async () => {
  const browser = await puppeteer.launch({ 
    headless: true,
   }); // Launch browser in non-headless mode for visibility
  const page = await browser.newPage();

  try {
    // Navigate to the initial page
    await page.goto('https://token.unlocks.app/');

    // Function to read content from the current page
    const readContent = async () => {
      const data = await page.evaluate(() => {

        const tokens = [];
        const rows = document.querySelectorAll('table.table-auto tr');
        rows.forEach(row => {
          const tds = row.querySelectorAll('td');
          if (tds.length >= 9) {
            const token = {
              token: tds[1].innerText.trim(),
              price: tds[2].innerText.trim(),
              h24: tds[3].innerText.trim(),
              m_cap: tds[4].innerText.trim(),
              cir_supply: tds[5].innerText.trim(),
              total_unlocked: tds[6].innerText.trim(),
              upcoming_unlock: tds[7].innerText.trim(),
              next_7d_emission: tds[8].innerText.trim()
            };
            tokens.push(token);
          }
        });
        return tokens;

      });

      return data;
    };

    // Define a flag to keep track of pagination state
    let isNextButtonEnabled = true;
    let allTokens = [];

    // Loop until the next button is disabled
    while (isNextButtonEnabled) {
      // Read content from the current page
      const tokens = await readContent();
      allTokens = allTokens.concat(tokens);

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

    // Convert JSON data to a Readable stream
    const jsonStream = Readable.from([JSON.stringify(allTokens)]);
    uploadToS3(jsonStream);

  } catch (error) {
    console.error('Error occurred:', error);
  } finally {
    await browser.close();
  }
})();

// Create an S3 client with inline credentials
const s3Client = new S3Client({
  credentials: awsCredentials,
  region: awsCredentials.region
});


const uploadToS3 = async (jsonStream) => {

  // Define the parameters for the PutObject operation
  const params = {
    Bucket: 'tokens-puppeteer-bucket',
    Key: 'data.json',
    Body: jsonStream,
    ContentType: 'application/json' // Specify content type as JSON
  };

  try {
    const upload = new Upload({
      client: s3Client,
      params: params,
      queueSize: 1 // Specify the number of concurrent parts to upload
    });

    const data = await upload.done(); // Wait for the upload to complete
    console.log('Successfully uploaded JSON data to S3:', data.Location);
  } catch (err) {
    console.error('Error uploading JSON data to S3:', err);
  }
};