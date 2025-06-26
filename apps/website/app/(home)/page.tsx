"use client";

import { WebsiteHeader } from "@/components/website-header";
import codeSnippet from "@/public/code-snippet.png";
import logoFull from "@/public/logo-full.png";
import onlydustLogo from "@/public/onlydust-logo-dark.png";
import { animate, stagger } from "motion";
import { splitText } from "motion-plus";
import { motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getGitHubStats } from "./actions/github-stats";

export default function Page() {
  const taglineRef = useRef<HTMLHeadingElement>(null);
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const [githubStats, setGithubStats] = useState({ stars: 3, forks: 2 });

  useEffect(() => {
    // Fetch GitHub stats
    const fetchGithubStats = async () => {
      try {
        const stats = await getGitHubStats();
        setGithubStats(stats);
      } catch (error) {
        console.error("Failed to fetch GitHub stats:", error);
        // Keep fallback values
      }
    };
    fetchGithubStats();

    document.fonts.ready.then(() => {
      // Animate tagline words
      if (taglineRef.current) {
        try {
          taglineRef.current.style.visibility = "visible";

          const { words } = splitText(taglineRef.current);

          // Apply gradient classes to each word to preserve the effect
          for (const word of words) {
            word.style.backgroundImage = "linear-gradient(to bottom, #222222, #444444)";
            word.style.backgroundClip = "text";
            word.style.webkitBackgroundClip = "text";
            word.style.color = "transparent";
            word.style.display = "inline-block";
          }

          animate(
            words,
            {
              opacity: [0, 1],
              y: [20, 0],
              filter: ["blur(8px)", "blur(0px)"],
            },
            {
              type: "spring",
              duration: 1.2,
              bounce: 0.1,
              delay: stagger(0.08, { startDelay: 0.2 }),
            },
          );
        } catch (error) {
          console.error("Tagline animation error:", error);
          // Fallback: just show the text
          if (taglineRef.current) {
            taglineRef.current.style.visibility = "visible";
            taglineRef.current.style.opacity = "1";
          }
        }
      }

      // Animate description words
      if (descriptionRef.current) {
        try {
          descriptionRef.current.style.visibility = "visible";

          const { words } = splitText(descriptionRef.current);

          animate(
            words,
            {
              opacity: [0, 1],
              y: [15, 0],
              filter: ["blur(6px)", "blur(0px)"],
            },
            {
              type: "spring",
              duration: 1,
              bounce: 0.05,
              delay: stagger(0.06, { startDelay: 0.8 }),
            },
          );
        } catch (error) {
          console.error("Description animation error:", error);
          // Fallback: just show the text
          if (descriptionRef.current) {
            descriptionRef.current.style.visibility = "visible";
            descriptionRef.current.style.opacity = "1";
          }
        }
      }
    });
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center">
      {/* Navigation */}
      <WebsiteHeader showLogo={false} animate={false} />

      {/* Main Content */}
      <main className="flex w-full flex-col items-center gap-[3.75rem] px-[1.25rem] pt-[5rem] pb-[3.125rem]">
        <div className="flex flex-col items-center gap-[3.75rem]">
          <div className="flex flex-col items-center gap-[3.125rem]">
            {/* Logo */}
            <motion.div
              initial={{
                opacity: 0,
                y: -50,
                filter: "blur(20px)",
              }}
              animate={{
                opacity: 0.6,
                y: 0,
                filter: "blur(0px)",
              }}
              transition={{
                duration: 1.2,
                ease: [0.21, 1.02, 0.73, 1],
                delay: 0,
              }}
              whileHover={{
                opacity: 1,
              }}
            >
              <Image src={logoFull} alt="Life.js" height={100} className="h-[20px] w-auto" />
            </motion.div>

            {/* Hero Section */}
            <div className="flex flex-col items-center gap-[2.5rem]">
              <div className="flex flex-col items-center gap-[0.91rem]">
                <h1
                  ref={taglineRef}
                  className="max-w-[29rem] text-center font-heading font-medium text-[3.1rem] leading-[3.5625rem] leading-trim tracking-[-0.09075rem]"
                  style={{ visibility: "hidden" }}
                >
                  The framework to build agentic web apps.
                </h1>
              </div>
              <p
                ref={descriptionRef}
                className="text-center font-body font-normal text-[17px] text-black/40 leading-none tracking-normal"
                style={{ visibility: "hidden" }}
              >
                Open-source, minimal, extensible, typesafe, and fullstack.
              </p>
            </div>

            {/* Code Example */}
            <motion.div
              initial={{
                opacity: 0,
                y: 40,
                filter: "blur(10px)",
              }}
              animate={{
                opacity: [0, 0.5, 1],
                y: 0,
                filter: "blur(0px)",
              }}
              transition={{
                duration: 1.5,
                ease: [0.21, 1.02, 0.73, 1],
                delay: 1.5,
              }}
            >
              <Image
                src={codeSnippet}
                alt="Code Example"
                height={450}
                className="-mt-29 -mb-34 pointer-events-none"
              />
            </motion.div>

            {/* CTA Section */}
            <motion.div
              className="flex flex-col items-center gap-[1.25rem]"
              initial={{
                opacity: 0,
                y: 40,
                filter: "blur(10px)",
              }}
              animate={{
                opacity: [0, 0.5, 1],
                y: 0,
                filter: "blur(0px)",
              }}
              transition={{
                duration: 1.5,
                ease: [0.21, 1.02, 0.73, 1],
                delay: 1.5,
              }}
            >
              <div className="flex items-center gap-[1.25rem]">
                {/* GitHub Stars */}
                <Link href="https://github.com/lifejs/lifejs" target="_blank">
                  <div className="flex h-[2rem] items-center gap-[0.5rem] rounded-[0.4rem] border border-[#cccccc] bg-gradient-to-b from-[#0000001a] to-[#6666661a] px-[0.6rem]">
                    <svg
                      className="h-[1rem] w-[1.025rem] text-[#555555]"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      role="img"
                      aria-label="GitHub star icon"
                    >
                      <title>GitHub star</title>
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span className="font-body font-medium text-[#555555] text-[0.85rem] leading-none leading-trim tracking-normal">
                      {githubStats.stars}
                    </span>
                  </div>
                </Link>

                {/* Get Started Button */}
                <div className="relative h-[2rem] rounded-[0.4rem] bg-black p-[0.0625rem]">
                  <Link
                    href="/docs/start-here/installation"
                    className="flex h-full items-center gap-[0.4625rem] rounded-[0.35rem] bg-gradient-to-b from-[#444444] to-black px-[0.4rem] font-body font-medium text-[0.85rem] text-white leading-none leading-trim tracking-normal transition-all hover:from-[#555555] hover:to-[#111111]"
                  >
                    <span>Get started</span>
                    <span>→</span>
                  </Link>
                </div>
              </div>

              {/* CLI Command */}
              <div className="font-code font-medium text-[#333333] text-[0.8125rem] leading-none leading-trim tracking-normal opacity-75">
                <span className="text-[#e77823]">~</span>
                <span> npx life init</span>
              </div>
            </motion.div>
          </div>

          {/* Divider */}
          <motion.div
            className="h-px w-[500px] bg-[#dddddd]"
            initial={{
              opacity: 0,
              filter: "blur(6px)",
            }}
            animate={{
              opacity: [0, 0.5, 1],
              filter: "blur(0px)",
            }}
            transition={{
              duration: 0.8,
              ease: [0.21, 1.02, 0.73, 1],
              delay: 2,
            }}
          />

          {/* Footer */}
          <motion.div
            className="flex flex-col items-center gap-[1.5rem]"
            initial={{
              opacity: 0,
              filter: "blur(8px)",
            }}
            animate={{
              opacity: [0, 0.5, 1],
              filter: "blur(0px)",
            }}
            transition={{
              duration: 1,
              ease: [0.21, 1.02, 0.73, 1],
              delay: 2,
            }}
          >
            <div className="flex items-center gap-[0.5rem]">
              <span className="text-[0.95rem] text-black/30 leading-none leading-trim tracking-normal">
                Sponsored by
              </span>
              <Link href="https://onlydust.com" target="_blank">
                <Image
                  src={onlydustLogo}
                  alt="OnlyDust"
                  height={100}
                  className="h-[23px] w-auto opacity-28 transition-opacity hover:opacity-38"
                />
              </Link>
            </div>
            <p className="font-handwriting text-[0.93rem] text-black/26 leading-none leading-trim tracking-normal">
              Made with love in SF.
            </p>
          </motion.div>
        </div>
      </main>

      {/* Styles for split text animation */}
      <style jsx>{`
        .split-word {
          will-change: transform, opacity;
        }
      `}</style>
    </div>
  );
}
