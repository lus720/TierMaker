
const VNDB_API_BASE = 'https://api.vndb.org/kana'

// Mimic the fetchVndbUserList logic
async function fetchVndbUserList(userId) {
    console.log(`Fetching list for user: ${userId}`)
    if (!userId.trim()) {
        throw new Error('请输入用户ID')
    }

    try {
        let allResults = []
        let hasMore = true
        let page = 1
        const resultsPerPage = 100

        const url = `${VNDB_API_BASE}/ulist`

        while (hasMore) {
            console.log(`Fetching page ${page}...`)
            const requestBody = {
                user: userId,
                fields: 'id, vn.id, vn.title',
                sort: 'vote',
                reverse: true,
                results: resultsPerPage,
                page: page,
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            })

            if (!response.ok) {
                console.error(`Status: ${response.status}`)
                const text = await response.text()
                console.error(`Body: ${text}`)
                throw new Error(`获取用户列表失败: ${response.status}`)
            }

            const data = await response.json()
            console.log(`Page ${page} results: ${data.results ? data.results.length : 0}`)
            console.log(`More: ${data.more}`)

            const rawResults = data.results || []

            if (rawResults.length === 0) {
                hasMore = false
                break
            }

            allResults = [...allResults, ...rawResults]

            if (data.more) {
                page++
            } else {
                hasMore = false
            }

            if (allResults.length >= 200) {
                console.log('Limit reached for test')
                hasMore = false
            }
        }

        return allResults
    } catch (error) {
        console.error(error)
        return []
    }
}

// Test with a known user ID (e.g. '2' which is often an admin or early user)
// Or 'u2'
fetchVndbUserList('u2').then(results => {
    console.log(`Total results: ${results.length}`)
})
