def _process_links_threaded(links):
    for index, url in enumerate(links):
        filename = url.split('/')[-1]
        first_line = fetch_url_content_threaded(url)
        log_panel.add(f'[URL {index + 1} ({filename})] First line content: {first_line}') 


def fetch_url_content_threaded(url):
    try:
        response = requests.get(url)
        response.raise_for_status()
        content = response.text.split('\n')[0]  # Gets the first line
        return content
    except requests.exceptions.RequestException as e:
        return f'Error fetching {url}: {e}'