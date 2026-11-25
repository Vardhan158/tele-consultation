import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { gsap, ScrollTrigger } from './scrollRuntime';
import { endCardStart, finaleProgress } from './finaleProgress';
import { easeStoryProgress, playbackProgress } from './storyPlayback';
import './story.css';

const StoryCanvas = lazy(() => import('./StoryCanvas'));

function createController() {
  const listeners = new Set();
  return {
    progress: 0,
    subscribe(listener) {
      listeners.add(listener);
      listener();
      return () => listeners.delete(listener);
    },
    update(progress) {
      this.progress = progress;
      listeners.forEach((listener) => listener());
    },
  };
}

export default function StorySection({ lenisRef }) {
  const sectionRef = useRef(null);
  const [controller] = useState(createController);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const [moment, setMoment] = useState('');

  useEffect(() => {
    const section = sectionRef.current;
    // Mount once near the viewport; retain the same Canvas on both scroll directions.
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setReady(true);
        observer.disconnect();
      }
    }, { rootMargin: '100% 0px' });
    observer.observe(section);
    const renderObserver = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '100px 0px' });
    renderObserver.observe(section.firstElementChild);

    const stage = section.firstElementChild;
    const runway = () => Math.max(1, section.offsetHeight - stage.offsetHeight);
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let scrollProgress = 0;
    let playbackFrame = 0;
    let previousTime = null;
    const publish = (progress) => {
      if (controller.progress === progress) return;
      section.style.setProperty('--story-progress', progress);
      controller.update(progress);
    };
    const animate = (time) => {
      const elapsed = previousTime === null ? 1000 / 60 : time - previousTime;
      previousTime = time;
      publish(easeStoryProgress(controller.progress, scrollProgress, elapsed));
      playbackFrame = controller.progress === scrollProgress ? 0 : requestAnimationFrame(animate);
      if (!playbackFrame) previousTime = null;
    };
    const commit = (rawProgress) => {
      scrollProgress = rawProgress;
      if (motion.matches) {
        cancelAnimationFrame(playbackFrame);
        playbackFrame = 0;
        previousTime = null;
        publish(playbackProgress(rawProgress, motion.matches));
      } else if (!playbackFrame) {
        playbackFrame = requestAnimationFrame(animate);
      }
    };
    const readProgress = () => gsap.utils.clamp(0, 1, -section.getBoundingClientRect().top / runway());
    let resizeProgress;
    let lastScroll;
    const syncScroll = () => {
      if (resizeProgress !== undefined || lastScroll === window.scrollY) return;
      lastScroll = window.scrollY;
      commit(readProgress());
    };
    let width = stage.clientWidth;
    let height = stage.clientHeight;
    const trigger = ScrollTrigger.create({
      trigger: section,
      start: 'top top',
      end: () => `+=${runway()}`,
      invalidateOnRefresh: true,
      onRefreshInit: () => {
        const nextWidth = stage.clientWidth;
        const nextHeight = stage.clientHeight;
        if (width === nextWidth && height === nextHeight) return;
        width = nextWidth;
        height = nextHeight;
        if (scrollProgress > 0 && scrollProgress < 1) resizeProgress = scrollProgress;
      },
      onUpdate: syncScroll,
      onRefresh: () => {
        if (resizeProgress !== undefined) {
          const destination = window.scrollY + section.getBoundingClientRect().top + runway() * resizeProgress;
          if (lenisRef?.current) {
            lenisRef.current.resize();
            lenisRef.current.scrollTo(destination, { immediate: true, force: true });
          } else {
            window.scrollTo({ top: destination, behavior: 'instant' });
          }
          resizeProgress = undefined;
        }
        lastScroll = undefined;
        syncScroll();
      },
    });
    // Native jumps and touch scrolling must use the same visual progress as Lenis.
    window.addEventListener('scroll', syncScroll, { passive: true });
    const syncMotion = () => commit(scrollProgress);
    motion.addEventListener('change', syncMotion);
    let refreshFrame = 0;
    const layoutObserver = new ResizeObserver(() => {
      if (refreshFrame) return;
      refreshFrame = requestAnimationFrame(() => {
        refreshFrame = 0;
        trigger.refresh();
      });
    });
    layoutObserver.observe(section);
    layoutObserver.observe(stage);
    if (section.previousElementSibling) layoutObserver.observe(section.previousElementSibling);
    return () => {
      motion.removeEventListener('change', syncMotion);
      window.removeEventListener('scroll', syncScroll);
      cancelAnimationFrame(refreshFrame);
      cancelAnimationFrame(playbackFrame);
      layoutObserver.disconnect();
      trigger.kill();
      controller.update(0);
      section.style.setProperty('--story-progress', 0);
      observer.disconnect();
      renderObserver.disconnect();
    };
  }, [controller, lenisRef]);

  useEffect(() => {
    let currentMoment = '';
    return controller.subscribe(() => {
      const t = finaleProgress(controller.progress);
      const next = controller.progress >= endCardStart ? 'end'
        : t >= .90 && t < .97 ? 'garden'
        : t >= .615 && t < .81 ? 'rest'
        : t >= .214 && t < .435 ? 'care' : '';
      if (next !== currentMoment) {
        currentMoment = next;
        setMoment(next);
      }
    });
  }, [controller]);

  return (
    <section ref={sectionRef} className="care-story" aria-labelledby="care-story-title">
      <div className="care-story-stage">
        <div className="care-story-copy">
          <p className="care-story-eyebrow">Kaizentrix Care</p>
          <h2 id="care-story-title">Care begins at home.</h2>
          <p>Scroll to step inside.</p>
        </div>
        <div className="care-story-canvas" aria-hidden="true">
          {ready && <Suspense fallback={null}><StoryCanvas controller={controller} visible={visible} /></Suspense>}
        </div>
        <div className="care-story-caption" aria-live="off">
          {moment === 'care' && 'He followed the care plan he discussed with his doctor.'}
          {moment === 'rest' && 'He took time to rest. Evening passed into morning.'}
          {moment === 'garden' && 'Later, he felt ready for a short walk in the garden.'}
        </div>
        <div className="care-story-end" data-visible={moment === 'end'}>
          <p className="care-story-eyebrow">Kaizentrix Care</p>
          <h2>Care starts with a conversation.</h2>
          <p>Talk with a doctor about the care that’s right for you. Individual outcomes vary.</p>
          <Link className="care-story-cta" to="/find-doctors">Book Your Consultation <span aria-hidden="true">→</span></Link>
        </div>
        <div className="care-story-progress" aria-hidden="true"><span /></div>
      </div>
    </section>
  );
}
