// src/services/locationImportService.js
import https from 'https';
import City from '../models/city.model.js';
import Area from '../models/area.model.js';
import SubArea from '../models/subarea.model.js';
import Pincode from '../models/pincode.model.js';
import ImportLog from '../models/importlog.model.js';
import logger from '../utils/logger.js';

// Use Node.js global setTimeout/clearTimeout, no need to import 'fs' or 'timers'.

class LocationImportService {
  constructor() {
    this.config = {
      batchSize: 25,
      requestTimeout: 10000,
      batchDelay: 200,
      maxRetries: 3,
      retryDelay: 2000,
      geocodeDelay: 1000,
    };
  }

  async fetchFromIndiaPost(pincode) {
    return new Promise((resolve) => {
      const url = `https://api.postalpincode.in/pincode/${pincode}`;
      const timeout = globalThis.setTimeout(
        () => resolve(null),
        this.config.requestTimeout
      );

      https
        .get(url, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            globalThis.clearTimeout(timeout);
            try {
              const json = JSON.parse(data);
              if (json[0]?.Status === 'Success' && json[0].PostOffice) {
                resolve({
                  postOffices: json[0].PostOffice.map((po) => ({
                    name: po.Name,
                    branchType: po.BranchType,
                    deliveryStatus: po.DeliveryStatus,
                    district: po.District,
                    state: po.State,
                    division: po.Division,
                    region: po.Region,
                    latitude: po.Latitude ? parseFloat(po.Latitude) : null,
                    longitude: po.Longitude ? parseFloat(po.Longitude) : null,
                  })),
                });
              } else {
                resolve(null);
              }
            } catch (err) {
              resolve(null);
            }
          });
        })
        .on('error', () => {
          globalThis.clearTimeout(timeout);
          resolve(null);
        });
    });
  }

  async geocodeWithNominatim(locationName, cityName) {
    return new Promise((resolve) => {
      const query = encodeURIComponent(`${locationName}, ${cityName}, India`);
      const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;

      const timeout = globalThis.setTimeout(
        () => resolve(null),
        this.config.requestTimeout
      );

      https
        .get(
          url,
          { headers: { 'User-Agent': 'ServiceAreaMapper/1.0' } },
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
              globalThis.clearTimeout(timeout);
              try {
                const json = JSON.parse(data);
                if (json.length > 0) {
                  resolve([parseFloat(json[0].lat), parseFloat(json[0].lon)]);
                } else {
                  resolve(null);
                }
              } catch (err) {
                resolve(null);
              }
            });
          }
        )
        .on('error', () => {
          globalThis.clearTimeout(timeout);
          resolve(null);
        });
    });
  }

  async fetchPincodeData(pincode, cityName) {
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const indiaPostData = await this.fetchFromIndiaPost(pincode);
        if (!indiaPostData) {
          if (attempt < this.config.maxRetries) {
            await new Promise((r) =>
              globalThis.setTimeout(r, this.config.retryDelay)
            );
            continue;
          }
          return { pincode, found: false };
        }

        const enrichedPostOffices = [];
        for (const po of indiaPostData.postOffices) {
          let coords = null;
          if (po.latitude && po.longitude) {
            coords = [po.latitude, po.longitude];
          } else {
            const geocoded = await this.geocodeWithNominatim(po.name, cityName);
            if (geocoded) {
              coords = geocoded;
              await new Promise((r) =>
                globalThis.setTimeout(r, this.config.geocodeDelay)
              );
            }
          }

          enrichedPostOffices.push({
            ...po,
            coordinates: coords,
          });
        }

        return {
          pincode,
          found: true,
          mainArea: indiaPostData.postOffices[0]?.district || cityName,
          district: indiaPostData.postOffices[0]?.district,
          state: indiaPostData.postOffices[0]?.state,
          postOffices: enrichedPostOffices,
        };
      } catch (err) {
        if (attempt === this.config.maxRetries) {
          return { pincode, found: false };
        }
      }
    }
    return { pincode, found: false };
  }

  async importCityData(cityName, pincodeRanges, centerCoords, adminId = null) {
    let importLog = null;

    try {
      const slug = cityName.toLowerCase().replace(/\s+/g, '-');
      const city = await City.findOneAndUpdate(
        { slug },
        {
          $set: {
            name: cityName,
            slug,
            state: 'Unknown',
            centerCoordinates: {
              type: 'Point',
              coordinates: [centerCoords[1], centerCoords[0]],
            },
            pincodeRanges,
            isActive: true,
            importedBy: adminId,
            'metadata.importStatus': 'processing',
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      importLog = await ImportLog.create({
        cityId: city._id,
        status: 'started',
        importedBy: adminId,
        metadata: { source: 'india_post_nominatim', config: { pincodeRanges } },
      });

      const pincodes = [];
      pincodeRanges.forEach((range) => {
        for (let pin = range.start; pin <= range.end; pin++) {
          pincodes.push(pin);
        }
      });

      await ImportLog.findByIdAndUpdate(importLog._id, {
        'progress.totalPincodes': pincodes.length,
        status: 'processing',
      });

      logger.log('\n' + '='.repeat(80));
      logger.log(`  MULTI-API AREA MAPPER - ${cityName.toUpperCase()}`);
      logger.log('='.repeat(80));
      logger.log(`Total pincodes: ${pincodes.length}\n`);

      const processedData = [];
      const total = pincodes.length;
      const startTime = Date.now();

      logger.log(`Fetching ${total} pincodes with geocoding...`);

      for (let i = 0; i < total; i += this.config.batchSize) {
        const batch = pincodes.slice(i, i + this.config.batchSize);
        const batchResults = await Promise.all(
          batch.map((pin) => this.fetchPincodeData(pin, cityName))
        );

        batchResults.forEach((result) => {
          if (result.found) processedData.push(result);
        });

        const processed = Math.min(i + this.config.batchSize, total);
        const percentage = (processed / total) * 100;
        const bar =
          '█'.repeat(Math.floor(percentage / 5)) +
          '░'.repeat(20 - Math.floor(percentage / 5));

        process.stdout.write(
          `\r   [${bar}] ${percentage.toFixed(1)}% (${processed}/${total})`
        );

        await ImportLog.findByIdAndUpdate(importLog._id, {
          'progress.processedPincodes': processed,
          'progress.successfulPincodes': processedData.length,
          'progress.percentage': Math.floor(percentage),
        });

        if (i + this.config.batchSize < total) {
          await new Promise((r) =>
            globalThis.setTimeout(r, this.config.batchDelay)
          );
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.log(
        `\nCompleted in ${duration}s - ${processedData.length}/${total} valid\n`
      );

      const firstValidPincode = processedData.find((p) => p.state);
      const stateDetected = firstValidPincode?.state || 'Unknown';
      await City.findByIdAndUpdate(city._id, { state: stateDetected });

      const results = await this.storeHierarchicalData(
        processedData,
        city._id,
        cityName
      );

      await this.updateCityMetadata(city._id);

      const totalDuration = Math.floor(
        (Date.now() - importLog.startedAt) / 1000
      );
      await ImportLog.findByIdAndUpdate(importLog._id, {
        status: 'completed',
        completedAt: new Date(),
        duration: totalDuration,
        results,
        'progress.percentage': 100,
      });

      logger.log('='.repeat(80));
      logger.log('  GENERATION COMPLETE');
      logger.log('='.repeat(80));
      logger.log(`Areas: ${results.areasCreated}`);
      logger.log(`Sub-areas: ${results.subAreasCreated}`);
      logger.log(`Pincodes: ${results.pincodesCreated}\n`);

      return {
        success: true,
        cityId: city._id,
        importLogId: importLog._id,
        summary: {
          totalPincodes: pincodes.length,
          validPincodes: processedData.length,
          ...results,
        },
      };
    } catch (error) {
      if (importLog) {
        await ImportLog.findByIdAndUpdate(importLog._id, {
          status: 'failed',
          completedAt: new Date(),
          errors: [{ error: error.message, timestamp: new Date() }],
        });
      }
      throw error;
    }
  }

  async storeHierarchicalData(processedData, cityId, cityName) {
    const results = { areasCreated: 0, subAreasCreated: 0, pincodesCreated: 0 };

    if (!processedData || processedData.length === 0) {
      logger.log('❌ No valid data to process');
      return results;
    }

    logger.log(`📊 Processing ${processedData.length} valid pincodes`);
    logger.log('🗑️  Clearing existing data...');

    await Area.deleteMany({ cityId });
    await SubArea.deleteMany({ cityId });
    await Pincode.deleteMany({ cityId });

    // ⭐ GROUP BY PINCODE
    const pincodeAreasMap = new Map();

    processedData.forEach((data) => {
      const pincode = data.pincode;
      const district = data.district || cityName;

      if (!pincodeAreasMap.has(pincode)) {
        pincodeAreasMap.set(pincode, {
          pincode: pincode,
          district: district,
          state: data.state,
          subAreas: [],
          coordinates: [],
        });
      }

      const pincodeArea = pincodeAreasMap.get(pincode);

      data.postOffices.forEach((po) => {
        // Add sub-area even if coordinates are missing
        const coords =
          po.coordinates && po.coordinates.length === 2 ? po.coordinates : null;

        pincodeArea.subAreas.push({
          name: po.name,
          pincode: data.pincode,
          branchType: po.branchType,
          deliveryStatus: po.deliveryStatus,
          district: data.district,
          state: data.state,
          division: po.division,
          region: po.region,
          coordinates: coords,
        });

        if (coords) {
          pincodeArea.coordinates.push(coords);
        }
      });
    });

    logger.log(
      `\n📍 Organized into ${pincodeAreasMap.size} pincode-based areas:`
    );
    pincodeAreasMap.forEach((data, pincode) => {
      logger.log(`   ${pincode}: ${data.subAreas.length} sub-areas`);
    });

    // Create Area documents (one per pincode)
    const areaDocuments = [];
    for (const [pincode, areaData] of pincodeAreasMap) {
      if (areaData.subAreas.length === 0) continue;

      // Merge all sub-area names for the Area name
      const areaName = areaData.subAreas.map((sa) => sa.name).join(', ');

      // Calculate centroid only from valid coordinates
      const validCoords = areaData.coordinates.filter(
        (c) => c && c.length === 2
      );
      const avgLat =
        validCoords.reduce((sum, c) => sum + c[0], 0) /
        (validCoords.length || 1);
      const avgLng =
        validCoords.reduce((sum, c) => sum + c[1], 0) /
        (validCoords.length || 1);

      areaDocuments.push({
        cityId,
        name: areaName || `${areaData.district} - ${pincode}`,
        slug: `${areaData.district.toLowerCase().replace(/\s+/g, '-')}-${pincode}-${cityId}`,
        type: 'locality',
        centroid: {
          type: 'Point',
          coordinates: [avgLng, avgLat],
        },
        pincodes: [pincode],
        metadata: {
          totalSubAreas: areaData.subAreas.length,
          district: areaData.district,
          state: areaData.state,
          averageCoordinates: { latitude: avgLat, longitude: avgLng },
        },
        isServiceable: false,
      });
    }

    logger.log(`\n💾 Inserting ${areaDocuments.length} areas...`);
    const insertedAreas = await Area.insertMany(areaDocuments);
    results.areasCreated = insertedAreas.length;
    logger.log(`✅ Created ${insertedAreas.length} areas`);

    // Map pincode to area ID
    const pincodeToAreaIdMap = new Map();
    insertedAreas.forEach((area) => {
      const pincode = area.pincodes[0];
      pincodeToAreaIdMap.set(pincode, area._id);
    });

    // Create SubArea documents
    const subAreaDocuments = [];
    for (const [pincode, areaData] of pincodeAreasMap) {
      const areaId = pincodeToAreaIdMap.get(pincode);
      if (!areaId) continue;

      areaData.subAreas.forEach((sub, idx) => {
        const coords =
          sub.coordinates && sub.coordinates.length === 2
            ? sub.coordinates
            : [0, 0];

        subAreaDocuments.push({
          areaId,
          cityId,
          name: sub.name,
          slug: `${sub.name.toLowerCase().replace(/\s+/g, '-')}-${sub.pincode}-${idx}`,
          pincode: sub.pincode,
          type: this.mapBranchType(sub.branchType),
          coordinates: {
            type: 'Point',
            coordinates: [coords[1], coords[0]],
          },
          details: {
            branchType: sub.branchType,
            deliveryStatus: sub.deliveryStatus,
            district: sub.district,
            state: sub.state,
            division: sub.division,
            region: sub.region,
          },
          isServiceable: false,
        });
      });
    }

    logger.log(`💾 Inserting ${subAreaDocuments.length} sub-areas...`);
    const insertedSubAreas = await SubArea.insertMany(subAreaDocuments);
    results.subAreasCreated = insertedSubAreas.length;
    logger.log(`✅ Created ${insertedSubAreas.length} sub-areas`);

    // Create Pincode documents
    const pincodeDocuments = [];
    for (const [pincode, areaData] of pincodeAreasMap) {
      const areaId = pincodeToAreaIdMap.get(pincode);
      const firstCoord = areaData.coordinates[0] || [0, 0];

      if (areaId) {
        pincodeDocuments.push({
          pincode: pincode,
          cityId,
          areaIds: [areaId],
          coordinates: {
            type: 'Point',
            coordinates: [firstCoord[1], firstCoord[0]],
          },
          isServiceable: false,
          metadata: {
            district: areaData.district,
            state: areaData.state,
            totalSubAreas: areaData.subAreas.length,
            primaryArea: areaData.subAreas.map((sa) => sa.name).join(', '),
          },
        });
      }
    }

    logger.log(`💾 Inserting ${pincodeDocuments.length} pincodes...`);
    const insertedPincodes = await Pincode.insertMany(pincodeDocuments);
    results.pincodesCreated = insertedPincodes.length;
    logger.log(`✅ Created ${insertedPincodes.length} pincodes\n`);

    return results;
  }

  async updateCityMetadata(cityId) {
    const [areasCount, subAreasCount, pincodesCount] = await Promise.all([
      Area.countDocuments({ cityId }),
      SubArea.countDocuments({ cityId }),
      Pincode.countDocuments({ cityId }),
    ]);

    await City.findByIdAndUpdate(cityId, {
      'metadata.totalAreas': areasCount,
      'metadata.totalSubAreas': subAreasCount,
      'metadata.totalPincodes': pincodesCount,
      'metadata.lastImportedAt': new Date(),
      'metadata.importStatus': 'completed',
    });
  }

  mapBranchType(branchType) {
    const typeMap = {
      'Head Post Office': 'head_post_office',
      'Sub Post Office': 'sub_post_office',
      'Post Office': 'post_office',
      'Branch Post Office': 'post_office',
    };
    return typeMap[branchType] || 'post_office';
  }

  async getImportStatus(importLogId) {
    return await ImportLog.findById(importLogId);
  }

  async getCityImports(cityId, limit = 10) {
    return await ImportLog.find({ cityId })
      .sort({ createdAt: -1 })
      .limit(limit);
  }
}

export default new LocationImportService();
