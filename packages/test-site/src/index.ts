import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { html } from 'hono/html'

const app = new Hono()

// Page 1: Search form (dropdown + text inputs + submit)
app.get('/', (c) => {
  return c.html(
    html`<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <title>Demo Travel - Search</title>
          <style>
            body {
              font-family: sans-serif;
              max-width: 600px;
              margin: 40px auto;
              padding: 0 20px;
            }
            h1 {
              color: #333;
            }
            .form-group {
              margin-bottom: 16px;
            }
            label {
              display: block;
              margin-bottom: 4px;
              font-weight: 600;
              font-size: 14px;
            }
            input,
            select {
              width: 100%;
              padding: 8px 12px;
              border: 1px solid #ccc;
              border-radius: 4px;
              font-size: 14px;
              box-sizing: border-box;
            }
            button[type='submit'] {
              background: #2563eb;
              color: white;
              border: none;
              padding: 10px 24px;
              border-radius: 4px;
              font-size: 14px;
              cursor: pointer;
            }
            button[type='submit']:hover {
              background: #1d4ed8;
            }
          </style>
        </head>
        <body>
          <h1>Demo Travel</h1>
          <p>Find your next adventure</p>
          <form action="/results" method="GET">
            <div class="form-group">
              <label for="trip-type">Trip Type</label>
              <select id="trip-type" name="trip_type">
                <option value="round-trip">Round Trip</option>
                <option value="one-way">One Way</option>
              </select>
            </div>
            <div class="form-group">
              <label for="origin">From</label>
              <input type="text" id="origin" name="origin" placeholder="Departure city" />
            </div>
            <div class="form-group">
              <label for="destination">To</label>
              <input type="text" id="destination" name="destination" placeholder="Arrival city" />
            </div>
            <div class="form-group">
              <label for="date">Date</label>
              <input type="date" id="date" name="date" />
            </div>
            <button type="submit">Search Flights</button>
          </form>
        </body>
      </html>`,
  )
})

// Page 2: Search results
app.get('/results', (c) => {
  const origin = c.req.query('origin') ?? 'Unknown'
  const destination = c.req.query('destination') ?? 'Unknown'
  const tripType = c.req.query('trip_type') ?? 'round-trip'

  return c.html(
    html`<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <title>Demo Travel - Results</title>
          <style>
            body {
              font-family: sans-serif;
              max-width: 600px;
              margin: 40px auto;
              padding: 0 20px;
            }
            h1 {
              color: #333;
            }
            .meta {
              color: #666;
              font-size: 14px;
              margin-bottom: 20px;
            }
            .flight-card {
              border: 1px solid #ddd;
              border-radius: 8px;
              padding: 16px;
              margin-bottom: 12px;
              cursor: pointer;
              transition: box-shadow 0.2s;
            }
            .flight-card:hover {
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            }
            .flight-card h3 {
              margin: 0 0 8px;
            }
            .flight-card .price {
              color: #2563eb;
              font-weight: 700;
              font-size: 18px;
            }
            .flight-card .details {
              color: #666;
              font-size: 13px;
            }
            a {
              text-decoration: none;
              color: inherit;
            }
          </style>
        </head>
        <body>
          <h1>Search Results</h1>
          <p class="meta">${origin} → ${destination} (${tripType})</p>

          <a href="/booking?flight=SK101&origin=${origin}&destination=${destination}">
            <div class="flight-card" data-flight="SK101">
              <h3>SkyAir SK101</h3>
              <div class="details">08:00 - 10:30 · Direct · 2h 30m</div>
              <div class="price">$320</div>
            </div>
          </a>

          <a href="/booking?flight=OA205&origin=${origin}&destination=${destination}">
            <div class="flight-card" data-flight="OA205">
              <h3>OceanAir OA205</h3>
              <div class="details">12:15 - 15:00 · Direct · 2h 45m</div>
              <div class="price">$280</div>
            </div>
          </a>

          <a href="/booking?flight=SK303&origin=${origin}&destination=${destination}">
            <div class="flight-card" data-flight="SK303">
              <h3>SkyAir SK303</h3>
              <div class="details">18:30 - 21:15 · 1 stop · 4h 45m</div>
              <div class="price">$195</div>
            </div>
          </a>
        </body>
      </html>`,
  )
})

// Page 3: Booking confirmation
app.get('/booking', (c) => {
  const flight = c.req.query('flight') ?? 'Unknown'
  const origin = c.req.query('origin') ?? ''
  const destination = c.req.query('destination') ?? ''

  return c.html(
    html`<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <title>Demo Travel - Booking</title>
          <style>
            body {
              font-family: sans-serif;
              max-width: 600px;
              margin: 40px auto;
              padding: 0 20px;
            }
            h1 {
              color: #333;
            }
            .booking-info {
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 16px;
              margin-bottom: 20px;
            }
            .booking-info p {
              margin: 4px 0;
            }
            .success {
              background: #dcfce7;
              border: 1px solid #86efac;
              border-radius: 8px;
              padding: 16px;
              display: none;
            }
            .success h2 {
              color: #166534;
              margin: 0 0 8px;
            }
            button {
              background: #2563eb;
              color: white;
              border: none;
              padding: 10px 24px;
              border-radius: 4px;
              font-size: 14px;
              cursor: pointer;
            }
            button:hover {
              background: #1d4ed8;
            }
          </style>
        </head>
        <body>
          <h1>Confirm Booking</h1>
          <div class="booking-info">
            <p><strong>Flight:</strong> <span id="flight-number">${flight}</span></p>
            <p><strong>Route:</strong> ${origin} → ${destination}</p>
          </div>
          <button
            id="confirm-btn"
            onclick="document.getElementById('success-msg').style.display='block'; this.disabled=true; this.textContent='Booked!';"
          >
            Confirm Booking
          </button>
          <div id="success-msg" class="success">
            <h2>Booking Confirmed!</h2>
            <p>Your flight ${flight} has been booked successfully.</p>
          </div>
        </body>
      </html>`,
  )
})

export function startTestSite(port = 3200): ReturnType<typeof serve> {
  const server = serve({ fetch: app.fetch, port })
  console.log(`[test-site] Demo Travel running on http://localhost:${port}`)
  return server
}

startTestSite()
