"use server";
export async function getGitHubStats() {
  try {
    const response = await fetch("https://api.github.com/repos/lifejs/lifejs", {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "lifejs-website",
      },
      // Cache for 10 minutes
      next: { revalidate: 600 },
    });

    if (!response.ok) {
      throw new Error(`GitHub API responded with status: ${response.status}`);
    }

    const data = await response.json();

    return {
      stars: data.stargazers_count,
      forks: data.forks_count,
    };
  } catch (error) {
    console.error("Error fetching GitHub stats:", error);
    // Return fallback data in case of error
    return { stars: 3, forks: 2 };
  }
}
