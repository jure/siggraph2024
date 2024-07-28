const cheerio = require('cheerio');
const fs = require('fs');

function sanitize(text) {
    // Also delete the Â character
    text = text.replace(/Â/g, '');
    // Convert â€™ to '
    text = text.replace(/â€™/g, "'");
    return text.replace(/\s+/g, ' ').trim();
}

// Append https://s2024.conference-program.org/ to links
function fixLink(link) {
    if (link && link.startsWith('/')) {
        return 'https://s2024.conference-program.org' + link;
    }
    return link;
}

function parseHTMLToJSON(html) {
    const $ = cheerio.load(html);
    const agendaItems = [];

    $('tr.agenda-item').each((index, element) => {
        // console.log('Processing agenda item', index);
        const agendaItem = {};
        const $element = $(element);

        agendaItem.s_utc = $element.attr('s_utc');
        agendaItem.e_utc = $element.attr('e_utc');

        const titleElement = $element.find('td.title-speakers-td > a');
        if (titleElement.length > 0) {
            agendaItem.event_link = fixLink(titleElement.attr('href'));
            agendaItem.event_title = sanitize(titleElement.text().trim());
        }

        // Sometimes the title is in a span of class 'presentation-title'
        if(!agendaItem.event_title) {
            const titleSpanElement = $element.find('span.presentation-title');
            if (titleSpanElement.length > 0) {
                agendaItem.event_title = sanitize(titleSpanElement.text().trim());
            }
            // This can contain a link
            const titleLinkElement = titleSpanElement.find('a');
            if (titleLinkElement.length > 0) {
                agendaItem.event_link = fixLink(titleLinkElement.attr('href'));
            }
        }

        // There is usually location information a span of class 'presentation-location', which also contains a link to the location
        const locationElement = $element.find('span.presentation-location');
        if (locationElement.length > 0) {
            const locationLink = locationElement.find('a');
            if (locationLink.length > 0) {
                agendaItem.location_link = fixLink(locationLink.attr('href'));
            }
            agendaItem.location = sanitize(locationElement.text().trim());
        }

        // If not a pirmary-session, we include the primary session id in 'primary_session'
        if(!$element.hasClass('primary-session')) {
            agendaItem.primary_session = $element.attr('psid');
        }

        // Sometimes, if the tr.agenda-item does not have a primary-session class, then we can find
        // the location by looking for a tr.agenda-item with a primary-session class that has a matching
        // psid attribute
        if(!agendaItem.location) {
            const psid = $element.attr('psid');
            if(psid) {
                const primarySessionElement = $(`tr.agenda-item[psid=${psid}].primary-session`);
                const locationElement = primarySessionElement.find('span.presentation-location');
                if (locationElement.length > 0) {
                    const locationLink = locationElement.find('a');
                    if (locationLink.length > 0) {
                        agendaItem.location_link = fixLink(locationLink.attr('href'));
                    }
                    agendaItem.location = sanitize(locationElement.text().trim());
                }
            }
        }

        
        agendaItem.presenters = [];
        $element.find('div.presenter-details').each((i, presenterElem) => {
            const presenterDetail = {};
            const $presenterElem = $(presenterElem);
            const presenterLink = $presenterElem.find('a');
            if (presenterLink.length > 0) {
                presenterDetail.link = fixLink(presenterLink.attr('href'));
                presenterDetail.name = sanitize(presenterLink.text().trim());
                agendaItem.presenters.push(presenterDetail);
            }
        });

        const ptrackListElement = $element.find('div.ptrack-list');
        if (ptrackListElement.length > 0) {
            agendaItem.tags = [];
            ptrackListElement.find('div.program-track').each((i, trackElem) => {
                agendaItem.tags.push($(trackElem).text().trim());
            });
        }

        if (!agendaItem.event_title || !agendaItem.location) {
            // Print the Cheerio HTML of the element to debug
            console.log($element.html())
            throw new Error('Event title not found');
        }
        agendaItems.push(agendaItem);
    });

    return agendaItems;
}

// Parse all HTML files in current directory and append the agenda items into a single JSON file
const files = fs.readdirSync('.');
const agendaItems = [];
files.forEach(file => {
    if (file.endsWith('.html')) {
        const html = fs.readFileSync(file, 'utf-8');
        const result = parseHTMLToJSON(html);
        agendaItems.push(...result);
    }
});

// Sort them by start time (s_utc)
agendaItems.sort((a, b) => a.s_utc - b.s_utc);

// Deduplicate by event title and location and time
const deduplicatedAgendaItems = [];
const seen = new Set();
agendaItems.forEach(item => {
    const key = `${item.event_title} ${item.location} ${item.s_utc}`;
    if (!seen.has(key)) {
        seen.add(key);
        deduplicatedAgendaItems.push(item);
    }
});

console.log(JSON.stringify(deduplicatedAgendaItems, null));
