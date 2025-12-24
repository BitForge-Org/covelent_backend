# City Onboarding Guide

This guide explains how to add a new City to the platform and enable it across all services.

## Prerequisites
- Backend access via terminal.
- MongoDB connection string configured in `.env`.

## Step 1: Add City & Geocode Data
Use the `seedCityData.js` script to create the City, its Areas, and automatically geocode them using Pincodes.

1.  Open `src/scripts/seedCityData.js`.
2.  Edit the **Configuration Section** at the top:
    ```javascript
    const CITY_NAME = 'Mumbai'; // Replace with your City
    const STATE_NAME = 'Maharashtra';
    
    const LOCATIONS = [
      { name: 'Bandra West', pincode: '400050' },
      { name: 'Andheri East', pincode: '400069' },
      // Add more rows as needed...
    ];
    ```
3.  Run the script:
    ```bash
    node src/scripts/seedCityData.js
    ```
    > **Output**: Look for `✅ Created City`, `✅ Geocoded` messages.

## Step 2: Activate City in Services
Once the data is seeded, use `activateCityInServices.js` to make this city serviceable in the app.

1.  Open `src/scripts/activateCityInServices.js`.
2.  Edit the **Configuration Section**:
    ```javascript
    const CITY_NAME = 'Mumbai'; // Must match the city you seeded
    ```
3.  Run the script:
    ```bash
    node src/scripts/activateCityInServices.js
    ```
    > **Action**: This adds the City ID to `serviceableCities` and all its Area IDs to `serviceableAreas` for **every** Service in the database.

## Summary of Files
| File | Purpose |
| :--- | :--- |
| `src/scripts/seedCityData.js` | **Create/Update** City, Areas, Pincodes, and Geocoordinates. |
| `src/scripts/activateCityInServices.js` | **Enable** the City/Areas in all Services. |
| `src/scripts/workerGeocode.js` | Helper worker for fetching coordinates (used by seeder). |
