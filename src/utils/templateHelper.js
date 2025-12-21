import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Loads an HTML template and replaces placeholders.
 * @param {string} templateName - The filename of the template (e.g., 'Welcome.html').
 * @param {Object} replacements - Key-value pairs for replacement (e.g., { "[User's First Name]": "John" }).
 * @returns {Promise<string>} - The processed HTML string.
 */
export async function loadTemplate(templateName, replacements) {
  try {
    // Navigate up from src/utils to root, then to public/email-templates
    const templatePath = path.join(
      __dirname,
      '../../public/email-templates',
      templateName
    );

    let html = await fs.promises.readFile(templatePath, 'utf8');

    for (const [key, value] of Object.entries(replacements)) {
        // Escaping special characters for regex, aiming to replace all occurrences
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedKey, 'g');
        html = html.replace(regex, value);
    }

    return html;
  } catch (error) {
    console.error(`Error loading template ${templateName}:`, error);
    throw error;
  }
}
