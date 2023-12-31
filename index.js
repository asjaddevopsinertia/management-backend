const express = require('express');
const bodyParser = require('body-parser');
const Shopify = require('shopify-api-node');
const moment = require('moment-timezone');
const jwt = require('jsonwebtoken')
require('dotenv').config()
const app = express();
app.use(bodyParser.json());

const shopify = new Shopify({
    shopName: process.env.Shop_Name,
    accessToken: process.env.Access_Token
});

moment.tz.setDefault("America/Los_Angeles");

const JWT_SECRET_KEY = process.env.SECRET_KEY;

const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    jwt.verify(token, JWT_SECRET_KEY, (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        req.user = decoded;
        next();
    });
};

app.post('/login', (req, res) => {
    // Mock user authentication (replace with your actual authentication logic)
    const { username, password } = req.body;
    // Replace this check with your authentication logic
    if (username === process.env.USERNAME && password === process.env.PASSWORD) {
        const token = jwt.sign({ username }, JWT_SECRET_KEY, { expiresIn: '1h' });
        res.json({ token });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

app.post('/orders/time-range',  verifyToken, async (req, res) => {
    try {
        const { range, customStart, customEnd } = req.body;
        let startDate, endDate;

        const currentDate = moment().tz('America/Los_Angeles');
        console.log("current", currentDate) // Current date in Los Angeles timezone
        if (range === 'week') {
            startDate = moment(currentDate).subtract(7, 'days').startOf('day').format('YYYY-MM-DDTHH:mm:ss-08:00');
            endDate = moment(currentDate).format('YYYY-MM-DDTHH:mm:ss-08:00');
        } else if (range === 'month') {
            startDate = moment(currentDate).subtract(1, 'months').startOf('month').format('YYYY-MM-DDTHH:mm:ss-08:00');
            endDate = moment(currentDate).endOf('month').format('YYYY-MM-DDTHH:mm:ss-08:00');
        } else if (range === 'year') {
            startDate = moment(currentDate).subtract(1, 'years').startOf('year').format('YYYY-MM-DDTHH:mm:ss-08:00');
            endDate = moment(currentDate).endOf('year').format('YYYY-MM-DDTHH:mm:ss-08:00');
        } else if (range === 'start') {
            startDate = moment(currentDate).startOf('week').format('YYYY-MM-DDTHH:mm:ss-08:00');
            endDate = moment(currentDate).format('YYYY-MM-DDTHH:mm:ss-08:00');
        }else if (range === 'custom') {
            // Custom start and end time from frontend
            startDate = moment(customStart).format('YYYY-MM-DDTHH:mm:ss-08:00');
            endDate = moment(customEnd).format('YYYY-MM-DDTHH:mm:ss-08:00');
        } else {
            return res.status(400).json({ error: 'Invalid time range' });
        }


        // Format dates in the way Shopify expects (ISO 8601 format)

        console.log("start", startDate)
        console.log("ned", endDate)
        const formattedStartDate = startDate
        const formattedEndDate = endDate

        // Use formattedStartDate and formattedEndDate to filter orders
        // Modify Shopify request to include the date range in the expected format
        // Example:
        let orders = [];
        let params = {
            created_at_min: formattedStartDate,
            created_at_max: formattedEndDate,
            status: 'closed',
            fulfillment_status: 'shipped',
            limit: 250,
            fields: 'id,name,created_at,fulfillment_status,financial_status,fulfillments, current_subtotal_price'
        };

        do {
            const ordersBatch = await shopify.order.list(params);
            orders = orders.concat(ordersBatch);
            params = ordersBatch.nextPageParameters;
        } while (params !== undefined);



        const locationIdsToCount = [65769406517, 61394944053]; // Add any other location IDs here

        const locationIdCounts = {};
        
        // Initialize counts for each location ID
        locationIdsToCount.forEach(id => {
          locationIdCounts[id] = 0;
        });
        
        // Loop through each order in the data
        orders.forEach(order => {
          // Check if 'fulfillments' key exists in the order
          if (order.fulfillments) {
            // Loop through each fulfillment in the order
            order.fulfillments.forEach(fulfillment => {
              // Check if 'location_id' matches any of the specified values
              if (locationIdsToCount.includes(fulfillment.location_id)) {
                locationIdCounts[fulfillment.location_id]++;
              }
            });
          }
        });
        
        console.log(locationIdCounts)
        
        const totalCurrentSubtotal = orders.reduce((total, order) => {
            // Ensure the current_subtotal_price key exists and is a valid number
            if (order && typeof order.current_subtotal_price === 'string') {
              const subtotal = parseFloat(order.current_subtotal_price);
              // Add the current subtotal to the total
              total += subtotal;
            }
            return Math.floor(total);
          }, 0);


        const ordersWithLocationCounts = { ...orders, locationIdCounts, totalCurrentSubtotal };

          
        res.json({ order:ordersWithLocationCounts });

        console.log('Range:', range);
        console.log('Orders count:', orders.length);
        console.log('Start Date:', formattedStartDate);
        console.log('End Date:', formattedEndDate);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching orders', details: error.message });
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});