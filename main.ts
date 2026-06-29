/// <reference path="./anime-torrent-provider.d.ts" />
/// <reference path="./core.d.ts" />

class Provider {
    private jackettUrl = "{{jackettUrl}}"
    private jackettApiKey = "{{jackettApiKey}}"
    private indexers = "{{indexers}}"

    getSettings(): AnimeProviderSettings {
        return {
            canSmartSearch: true,
            smartSearchFilters: ["batch", "episodeNumber", "resolution", "query"],
            supportsAdult: false,
            type: "main",
        }
    }

    async search(opts: AnimeSearchOptions): Promise<AnimeTorrent[]> {
        const results = await this.fetchJackett(opts.query)
        return results.map(r => this.toAnimeTorrent(r))
    }

    async smartSearch(opts: AnimeSmartSearchOptions): Promise<AnimeTorrent[]> {
        const query = opts.query || this.buildQuery(opts)

        if (opts.batch) {
            const results = await this.fetchJackett(query)
            return results
                .filter(r => this.matchesResolution(r.Title, opts.resolution))
                .map(r => {
                    const t = this.toAnimeTorrent(r)
                    t.isBatch = true
                    return t
                })
        }

        let epQuery = query
        if (opts.episodeNumber > 0) {
            const ep = String(opts.episodeNumber).padStart(2, "0")
            epQuery = `${query} ${ep}`
        }

        const results = await this.fetchJackett(epQuery)
        return results
            .filter(r => this.matchesResolution(r.Title, opts.resolution))
            .map(r => this.toAnimeTorrent(r))
    }

    private buildQuery(opts: AnimeSmartSearchOptions): string {
        const allTitles = [
            opts.media.romajiTitle,
            opts.media.englishTitle || "",
            ...(opts.media.synonyms || []),
        ].filter(Boolean)

        const { titles, season, part } = $scannerUtils.buildSmartSearchTitles(allTitles)
        const baseTitle = titles[0] || opts.media.romajiTitle

        if (season > 1) return `${baseTitle} Season ${season}`
        if (part > 1) return `${baseTitle} Part ${part}`
        return baseTitle
    }

    async getTorrentInfoHash(torrent: AnimeTorrent): Promise<string> {
        return torrent.infoHash || ""
    }

    async getTorrentMagnetLink(torrent: AnimeTorrent): Promise<string> {
        return torrent.magnetLink || ""
    }

    async getLatest(): Promise<AnimeTorrent[]> {
        const results = await this.fetchJackett("anime")
        return results.map(r => this.toAnimeTorrent(r))
    }

    private async fetchJackett(query: string): Promise<JackettResult[]> {
        const baseUrl = this.jackettUrl.replace(/\/$/, "")
        const indexer = (this.indexers || "all").trim()
        const url = `${baseUrl}/api/v2.0/indexers/${indexer}/results?apikey=${encodeURIComponent(this.jackettApiKey)}&Query=${encodeURIComponent(query)}&Category[]=5070`

        console.log(`[jackett-provider] GET ${url}`)

        const response = await fetch(url)
        if (!response.ok) {
            throw new Error(`Jackett request failed: ${response.status} ${response.statusText}`)
        }

        const data: JackettResponse = await (response.json<JackettResponse>() as any)
        return data.Results || []
    }

    // resolution from opts is e.g. "1080" or "720" (no trailing p)
    private matchesResolution(title: string, resolution: string): boolean {
        if (!resolution || resolution === "") return true
        return title.includes(resolution)
    }

    private toAnimeTorrent(r: JackettResult): AnimeTorrent {
        const leechers = (r.Peers || 0) - (r.Seeders || 0)
        const parsed = $habari.parse(r.Title)
        return {
            name: r.Title,
            date: r.PublishDate || new Date().toISOString(),
            size: r.Size || 0,
            formattedSize: "",
            seeders: r.Seeders || 0,
            leechers: leechers > 0 ? leechers : 0,
            downloadCount: r.Grabs || 0,
            link: r.Details || r.Guid || "",
            downloadUrl: r.Link || "",
            magnetLink: r.MagnetUri || "",
            infoHash: r.InfoHash || "",
            resolution: parsed.video_resolution || "",
            isBatch: false,
            episodeNumber: this.parseEpisodeNumber(parsed),
            releaseGroup: parsed.release_group || "",
            isBestRelease: false,
            confirmed: false,
        }
    }

    private parseEpisodeNumber(parsed: $habari.Metadata): number {
        if (parsed.episode_number && parsed.episode_number.length > 0) {
            const n = parseInt(parsed.episode_number[0], 10)
            if (!isNaN(n) && n > 0) return n
        }
        return -1
    }
}

type JackettResponse = {
    Results: JackettResult[]
    Indexers: any[]
}

type JackettResult = {
    Title: string
    Guid: string
    Link: string
    Details: string
    PublishDate: string
    Size: number
    Grabs: number
    Seeders: number
    Peers: number
    InfoHash: string
    MagnetUri: string
    Tracker: string
    TrackerId: string
}
