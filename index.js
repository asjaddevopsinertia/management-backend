const express = require('express');
const bodyParser = require('body-parser');
const Shopify = require('shopify-api-node');
const moment = require('moment-timezone');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const axios = require('axios');
const _ = require('lodash');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());
app.use(cors());

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
    const { username, password } = req.body;
    if (username === process.env.USERNAME && password === process.env.PASSWORD) {
        const token = jwt.sign({ username }, JWT_SECRET_KEY, { expiresIn: '1000d' });
        res.json({ token });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

app.post('/orders/time-range', verifyToken, async (req, res) => {
    try {
        const { range, customStart, customEnd } = req.body;
        let startDate, endDate;

        const currentDate = moment().tz('America/Los_Angeles');

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
        } else if (range === 'custom') {
            startDate = moment(customStart).format('YYYY-MM-DDTHH:mm:ss-08:00');
            endDate = moment(customEnd).format('YYYY-MM-DDTHH:mm:ss-08:00');
        } else {
            return res.status(400).json({ error: 'Invalid time range' });
        }

        const formattedStartDate = startDate;
        const formattedEndDate = endDate;

        const orders = await getAllOrdersInDateRange(formattedStartDate, formattedEndDate);

        const locationIdsToCount = [65769406517, 61394944053];
        const locationIdCounts = _.zipObject(locationIdsToCount, Array(locationIdsToCount.length).fill(0));
        const productDetails = {};

        orders.forEach(order => {
            if (order.fulfillments) {
                order.fulfillments.forEach(fulfillment => {
                    if (locationIdsToCount.includes(fulfillment.location_id)) {
                        locationIdCounts[fulfillment.location_id]++;
                    }

                    fulfillment.line_items.forEach(item => {
                        const locationID = fulfillment.location_id;

                        if (!productDetails[locationID]) {
                            productDetails[locationID] = {};
                        }

                        const { name: productName, grams, quantity } = item;

                        if (!productDetails[locationID][productName]) {
                            productDetails[locationID][productName] = {
                                quantity: 0,
                                totalGrams: 0
                            };
                        }

                        productDetails[locationID][productName].quantity += quantity;
                        productDetails[locationID][productName].totalGrams += grams;
                    });
                });
            }
        });

        const totalCurrentSubtotal = _.reduce(orders, (total, order) => {
            if (order && typeof order.current_subtotal_price === 'string') {
                const subtotal = parseFloat(order.current_subtotal_price);
                total += subtotal;
            }
            return Math.floor(total);
        }, 0);

        const ordersWithLocationCounts = {
            orders,
            locationIdCounts,
            totalCurrentSubtotal,
            productDetails
        };

        res.json({ order: ordersWithLocationCounts });

        console.log('Range:', range);
        console.log('Orders count:', orders.length);
        console.log('Start Date:', formattedStartDate);
        console.log('End Date:', formattedEndDate);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching orders', details: error.message });
    }
});

const getAllOrdersInDateRange = async (startDate, endDate) => {
    const orders = [];
    let params = {
        created_at_min: startDate,
        created_at_max: endDate,
        status: 'closed',
        fulfillment_status: 'shipped',
        limit: 250,
        fields: 'id,name,created_at,fulfillment_status,financial_status,fulfillments,current_subtotal_price'
    };

    do {
        const response = await shopify.order.list(params);
        orders.push(...response);
        params = response.nextPageParameters;
    } while (params !== undefined);

    return orders;
};

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
