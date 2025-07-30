'use strict';

const UncompressedPositionParserUtil = require('./UncompressedPositionParserUtil.js');
const CompressedPositionUtil = require('./CompressedPositionUtil.js');
const Position = require('./../MessageModels/Position.js');
const ExtensionsModels = require('./../PostionExtensions/ExtensionModels');
const PositionParserUtils = require('../Position/UncompressedPositionParserUtil');

const tryParseNotCompressed = function (contentWithoutTimestamp) {
    const symbol = contentWithoutTimestamp[8] + contentWithoutTimestamp[18];
    const latitudeString = contentWithoutTimestamp.substr(0, 8);
    const longitudeString = contentWithoutTimestamp.substr(9, 9);

    const position = new Position(UncompressedPositionParserUtil.fromDMtoDecimalLatitude(latitudeString), UncompressedPositionParserUtil.fromDMtoDecimalLongitude(longitudeString));

    position.setSymbol(symbol);
    return position;
};

const tryParseCompressed = function (contentWithoutTimestamp) {
    return CompressedPositionUtil.getPositionForCompressedString(contentWithoutTimestamp);
};

const decodeCompressedAltitude = function (twoChar) {
  if (twoChar.length !== 2) {
    throw new Error("Input must be exactly 2 characters.");
  }

  const c = twoChar.charCodeAt(0) - 33;
  const s = twoChar.charCodeAt(1) - 33;
  const cs = c * 91 + s;
  const altitudeFeet = Math.pow(1.002, cs);
  const altitudeMeters = altitudeFeet * 0.3048;

  return altitudeMeters;
}

const decodeCompressedCourseSpeed = function (twoChar) {
  if (twoChar.length !== 2) {
    throw new Error("Input must be exactly 2 characters.");
  }

  const c = twoChar.charCodeAt(0) - 33;  // Kurswert
  const s = twoChar.charCodeAt(1) - 33;  // Speedwert
  const courseDegrees = c * 4;
  const speedKnots = Math.pow(1.08, s) - 1;

  return new ExtensionsModels.CourseSpeed(courseDegrees, PositionParserUtils.knotsToMetersPerSecond(speedKnots));
}

module.exports = {
    parsePositionAndCommentString: function (stringPartWithPosAndComment) {
        let position;
        let comment;

        if (isNaN(parseInt(stringPartWithPosAndComment[0]))) {
            //probably compressed format
            position = tryParseCompressed(stringPartWithPosAndComment.substr(0, 13));
            comment = stringPartWithPosAndComment.substr(13);
            const ext = stringPartWithPosAndComment.substr(10,2);
            const compType = stringPartWithPosAndComment.substr(12,1);

            // check if encoded alt or speed/course
            if (compType == 'Q') {
                position.setAltitude(decodeCompressedAltitude(ext));
            }

            if (compType == 'G') {
                position.setExtension(decodeCompressedCourseSpeed(ext));
            }
        }
        else {
            //probably not compressed
            position = tryParseNotCompressed(stringPartWithPosAndComment.substr(0, 19));
            comment = stringPartWithPosAndComment.substr(19);
        }

        if (comment && comment.length > 0) {
            const parsedFromComment = UncompressedPositionParserUtil.parseAltitudeWeatherAndExtension(comment);

            if (parsedFromComment.extension)
                position.setExtension(parsedFromComment.extension);

            if (parsedFromComment.altitude)
                position.setAltitude(parsedFromComment.altitude);

            if (parsedFromComment.weather)
                position.setWeather(parsedFromComment.weather);

            if (parsedFromComment.telemetry)
                position.setTelemetry(parsedFromComment.telemetry);

            if (parsedFromComment.comment)
                position.setComment(parsedFromComment.comment);
        }

        return position;
    },

    parseTimestamp: function (timestampString) {
        const now = new Date();

        const ints = [parseInt(timestampString.substr(0, 2)), parseInt(timestampString.substr(2, 2)), parseInt(timestampString.substr(4, 2))];

        if (isNaN(ints[0]) || isNaN(ints[1]) || isNaN(ints[2])) {
            throw new Error('NaN in timestamp:' + ints);
        }

        if (timestampString[6] == 'z') {
            now.setUTCDate(ints[0]);
            now.setUTCHours(ints[1], ints[2], 0, 0);
        }
        else if (timestampString[6] == 'h') {
            now.setUTCHours(ints[0], ints[1], ints[2], 0);
        }
        else if (timestampString[6] == '/') {
            throw new Error('Zulu time should be used, not local');
        }
        else
            throw new Error('Not a timestamp?');

        return now;
    }
};