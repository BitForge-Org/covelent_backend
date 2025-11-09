import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';

const swaggerDocument = YAML.load(
  path.join(process.cwd(), 'docs', 'swagger-bundled.yaml')
);

export function setupSwagger(app) {
  // Custom HTML that includes the button
  const customHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Swagger UI</title>
      <link rel="stylesheet" type="text/css" href="./swagger-ui.css" />
      <style>
        .location-widget {
          position: fixed;
          bottom: 20px;
          right: 20px;
          background-color: white;
          padding: 15px;
          border-radius: 10px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          z-index: 99999;
          min-width: 280px;
        }
        .location-widget h4 {
          margin: 0 0 10px 0;
          font-size: 14px;
          color: #333;
        }
        .location-widget input {
          width: 100%;
          padding: 8px;
          margin-bottom: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 13px;
          box-sizing: border-box;
        }
        .location-widget input:focus {
          outline: none;
          border-color: #4CAF50;
        }
        .location-widget-buttons {
          display: flex;
          gap: 8px;
        }
        .auto-fill-location-btn {
          flex: 1;
          background-color: #4CAF50;
          color: white;
          padding: 10px;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          transition: all 0.3s;
        }
        .auto-fill-location-btn:hover {
          background-color: #45a049;
        }
        .auto-fill-location-btn:disabled {
          background-color: #cccccc;
          cursor: not-allowed;
        }
        .copy-btn {
          flex: 1;
          background-color: #2196F3;
          color: white;
          padding: 10px;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          transition: all 0.3s;
        }
        .copy-btn:hover {
          background-color: #0b7dda;
        }
      </style>
    </head>
    <body>
      <div id="swagger-ui"></div>
      
      <!-- Location widget with input fields -->
      <div class="location-widget">
        <h4>📍 My Location</h4>
        <input type="text" id="latitudeField" placeholder="Latitude" readonly>
        <input type="text" id="longitudeField" placeholder="Longitude" readonly>
        <div class="location-widget-buttons">
          <button id="autoFillBtn" class="auto-fill-location-btn">Get Location</button>
          <button id="copyLatBtn" class="copy-btn">Copy Lat</button>
          <button id="copyLonBtn" class="copy-btn">Copy Lon</button>
        </div>
      </div>
      
      <script src="./swagger-ui-bundle.js"></script>
      <script src="./swagger-ui-standalone-preset.js"></script>
      <script>
        window.onload = function() {
          const ui = SwaggerUIBundle({
            spec: ${JSON.stringify(swaggerDocument)},
            dom_id: '#swagger-ui',
            deepLinking: true,
            presets: [
              SwaggerUIBundle.presets.apis,
              SwaggerUIStandalonePreset
            ],
            plugins: [
              SwaggerUIBundle.plugins.DownloadUrl
            ],
            layout: "StandaloneLayout"
          });
          
          window.ui = ui;
          
          const latitudeField = document.getElementById('latitudeField');
          const longitudeField = document.getElementById('longitudeField');
          
          // Get Location Button click handler
          document.getElementById('autoFillBtn').onclick = function() {
            const btn = this;
            
            if (!navigator.geolocation) {
              alert('Geolocation is not supported by your browser.');
              return;
            }
            
            // Disable button while fetching
            btn.disabled = true;
            btn.textContent = 'Getting...';
            
            navigator.geolocation.getCurrentPosition(
              function(position) {
                const lat = position.coords.latitude.toFixed(6);
                const lon = position.coords.longitude.toFixed(6);
                
                // Fill the display fields
                latitudeField.value = lat;
                longitudeField.value = lon;
                
                // Also try to fill Swagger UI fields if they exist
                const swaggerLatField = document.querySelector('input[placeholder*="latitude" i]') || 
                                       document.querySelector('input[data-param-name*="latitude" i]') ||
                                       document.querySelector('input[name*="latitude" i]');
                const swaggerLonField = document.querySelector('input[placeholder*="longitude" i]') || 
                                       document.querySelector('input[data-param-name*="longitude" i]') ||
                                       document.querySelector('input[name*="longitude" i]');
                
                if (swaggerLatField && swaggerLonField) {
                  swaggerLatField.value = lat;
                  swaggerLonField.value = lon;
                  
                  // Trigger input events
                  ['input', 'change'].forEach(eventType => {
                    const event = new Event(eventType, { bubbles: true });
                    swaggerLatField.dispatchEvent(event);
                    swaggerLonField.dispatchEvent(event);
                  });
                }
                
                // Re-enable button
                btn.disabled = false;
                btn.textContent = '✓ Got it!';
                setTimeout(() => {
                  btn.textContent = 'Get Location';
                }, 2000);
              },
              function(error) {
                let errorMessage = 'Unable to retrieve location. ';
                switch(error.code) {
                  case error.PERMISSION_DENIED:
                    errorMessage += 'Please allow location access.';
                    break;
                  case error.POSITION_UNAVAILABLE:
                    errorMessage += 'Location information unavailable.';
                    break;
                  case error.TIMEOUT:
                    errorMessage += 'Request timed out.';
                    break;
                  default:
                    errorMessage += 'Unknown error occurred.';
                }
                alert(errorMessage);
                
                // Re-enable button
                btn.disabled = false;
                btn.textContent = 'Get Location';
              },
              {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
              }
            );
          };
          
          // Copy Latitude Button
          document.getElementById('copyLatBtn').onclick = function() {
            const btn = this;
            const value = latitudeField.value;
            
            if (!value) {
              alert('Please get your location first!');
              return;
            }
            
            copyToClipboard(value, btn, 'Copy Lat');
          };
          
          // Copy Longitude Button
          document.getElementById('copyLonBtn').onclick = function() {
            const btn = this;
            const value = longitudeField.value;
            
            if (!value) {
              alert('Please get your location first!');
              return;
            }
            
            copyToClipboard(value, btn, 'Copy Lon');
          };
          
          // Helper function to copy text to clipboard
          function copyToClipboard(text, btn, originalText) {
            navigator.clipboard.writeText(text).then(
              function() {
                btn.textContent = '✓ Copied!';
                setTimeout(() => {
                  btn.textContent = originalText;
                }, 1500);
              },
              function(err) {
                // Fallback method
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                document.body.appendChild(textArea);
                textArea.select();
                try {
                  document.execCommand('copy');
                  btn.textContent = '✓ Copied!';
                  setTimeout(() => {
                    btn.textContent = originalText;
                  }, 1500);
                } catch (err) {
                  alert('Failed to copy: ' + err);
                }
                document.body.removeChild(textArea);
              }
            );
          }
        };
      </script>
    </body>
    </html>
  `;

  app.get('/api-docs', (req, res) => {
    res.send(customHtml);
  });

  app.use('/api-docs', swaggerUi.serve);
}
