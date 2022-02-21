import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { createContextScope } from '@radix-ui/react-context';
import { composeEventHandlers } from '@radix-ui/primitive';
import { useComposedRefs } from '@radix-ui/react-compose-refs';
import { useCallbackRef } from '@radix-ui/react-use-callback-ref';
import { useControllableState } from '@radix-ui/react-use-controllable-state';
import { useLayoutEffect } from '@radix-ui/react-use-layout-effect';
import { Primitive } from '@radix-ui/react-primitive';
import * as DismissableLayer from '@radix-ui/react-dismissable-layer';
import { Presence } from '@radix-ui/react-presence';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { UnstablePortal } from '@radix-ui/react-portal';

import type * as Radix from '@radix-ui/react-primitive';
import type { Scope } from '@radix-ui/react-context';

/* -------------------------------------------------------------------------------------------------
 * ToastProvider
 * -----------------------------------------------------------------------------------------------*/

const PROVIDER_NAME = 'ToastProvider';

type SwipeDirection = 'up' | 'down' | 'left' | 'right';
type ToastProviderContextValue = {
  label: string;
  duration: number;
  swipeDirection: SwipeDirection;
  swipeThreshold: number;
  toastCount: number;
  viewport: ToastViewportElement | null;
  onViewportChange(viewport: ToastViewportElement): void;
  isClosePaused: boolean;
  onClosePause(): void;
  onCloseResume(): void;
  onToastAdd(): void;
  onToastRemove(): void;
};

type ScopedProps<P> = P & { __scopeToast?: Scope };
const [createToastContext, createToastScope] = createContextScope('Toast');
const [ToastProviderProvider, useToastProviderContext] =
  createToastContext<ToastProviderContextValue>(PROVIDER_NAME);

interface ToastProviderProps {
  /**
   * An author-localized label for each toast. Used to help screen reader users
   * associate the interruption with a toast.
   * @defaultValue 'Notification'
   */
  label?: string;
  /**
   * Time in milliseconds that each toast should remain visible for.
   * @defaultValue 5000
   */
  duration?: number;
  /**
   * Direction of pointer swipe that should close the toast.
   * @defaultValue 'right'
   */
  swipeDirection?: SwipeDirection;
  /**
   * Distance in pixels that the swipe must pass before a close is triggered.
   * @defaultValue 50
   */
  swipeThreshold?: number;
  children?: React.ReactNode;
}

const ToastProvider: React.FC<ToastProviderProps> = (props: ScopedProps<ToastProviderProps>) => {
  const {
    __scopeToast,
    label = 'Notification',
    duration = 5000,
    swipeDirection = 'right',
    swipeThreshold = 50,
    children,
  } = props;
  const [viewport, setViewport] = React.useState<ToastViewportElement | null>(null);
  const [isClosePaused, setIsClosePaused] = React.useState(false);
  const [toastCount, setToastCount] = React.useState(0);
  return (
    <ToastProviderProvider
      scope={__scopeToast}
      label={label}
      duration={duration}
      swipeDirection={swipeDirection}
      swipeThreshold={swipeThreshold}
      toastCount={toastCount}
      viewport={viewport}
      onViewportChange={setViewport}
      isClosePaused={isClosePaused}
      onClosePause={React.useCallback(() => setIsClosePaused(true), [])}
      onCloseResume={React.useCallback(() => setIsClosePaused(false), [])}
      onToastAdd={React.useCallback(() => setToastCount((prevCount) => prevCount + 1), [])}
      onToastRemove={React.useCallback(() => setToastCount((prevCount) => prevCount - 1), [])}
    >
      {children}
    </ToastProviderProvider>
  );
};

ToastProvider.displayName = PROVIDER_NAME;

/* -------------------------------------------------------------------------------------------------
 * ToastViewport
 * -----------------------------------------------------------------------------------------------*/

const VIEWPORT_NAME = 'ToastViewport';
const VIEWPORT_DEFAULT_HOTKEY = ['F8'];

type ToastViewportElement = React.ElementRef<typeof Primitive.ol>;
type PrimitiveOrderedListProps = Radix.ComponentPropsWithoutRef<typeof Primitive.ol>;
interface ToastViewportProps extends Omit<PrimitiveOrderedListProps, 'children'> {
  /**
   * The keys to use as the keyboard shortcut that will move focus to the toast viewport.
   * @defaultValue ['F8']
   */
  hotkey?: string[];
  /**
   * An author-localized label for the toast viewport to provide context for screen reader users
   * when navigating page landmarks. The available `{hotkey}` placeholder will be replaced for you.
   * @defaultValue 'Notifications ({hotkey})'
   */
  label?: string;
}

const ToastViewport = React.forwardRef<ToastViewportElement, ToastViewportProps>(
  (props: ScopedProps<ToastViewportProps>, forwardedRef) => {
    const {
      __scopeToast,
      hotkey = VIEWPORT_DEFAULT_HOTKEY,
      label = 'Notifications ({hotkey})',
      ...viewportProps
    } = props;
    const context = useToastProviderContext(VIEWPORT_NAME, __scopeToast);
    const wrapperRef = React.useRef<HTMLDivElement>(null);
    const ref = React.useRef<ToastViewportElement>(null);
    const composedRefs = useComposedRefs(forwardedRef, ref, context.onViewportChange);
    const hotkeyLabel = hotkey.join('+').replace(/Key/g, '').replace(/Digit/g, '');

    React.useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        // we use `event.code` as it is consistent regardless of meta keys that were pressed.
        // for example, `event.key` for `Control+Alt+t` is `†` and `t !== †`
        const isHotkeyPressed = hotkey.every((key) => (event as any)[key] || event.code === key);
        if (isHotkeyPressed) ref.current?.focus();
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [hotkey]);

    React.useEffect(() => {
      const wrapper = wrapperRef.current;
      if (wrapper) {
        // Toasts are not in the viewport React tree so we need to bind DOM events
        wrapper.addEventListener('focusin', context.onClosePause);
        wrapper.addEventListener('focusout', context.onCloseResume);
        wrapper.addEventListener('pointerenter', context.onClosePause);
        wrapper.addEventListener('pointerleave', context.onCloseResume);
        window.addEventListener('blur', context.onClosePause);
        window.addEventListener('focus', context.onCloseResume);
        return () => {
          wrapper.removeEventListener('focusin', context.onClosePause);
          wrapper.removeEventListener('focusout', context.onCloseResume);
          wrapper.removeEventListener('pointerenter', context.onClosePause);
          wrapper.removeEventListener('pointerleave', context.onCloseResume);
          window.removeEventListener('blur', context.onClosePause);
          window.removeEventListener('focus', context.onCloseResume);
        };
      }
    }, [context.onCloseResume, context.onClosePause]);

    React.useEffect(() => {
      const viewport = ref.current;
      // Re-order DOM so most recent toasts are at top of DOM structure to improve tab order
      if (viewport) {
        let moved: Node[] = [];
        const observer = new MutationObserver((mutations) => {
          const [childListMutation] = mutations;
          childListMutation.addedNodes.forEach((node) => {
            if (!moved.includes(node)) {
              viewport.prepend(node);
              moved = [...moved, node];
            }
          });
        });
        observer.observe(viewport, { childList: true });
        return () => observer.disconnect();
      }
    }, []);

    return (
      <DismissableLayer.Branch
        ref={wrapperRef}
        role="region"
        aria-label={label.replace('{hotkey}', hotkeyLabel)}
        // Ensure virtual cursor from landmarks menus triggers focus/blur for pause/resume
        tabIndex={-1}
        // incase list has size when empty (e.g. padding), we remove pointer events so
        // it doesn't prevent interactions with page elements that it overlays
        style={{ pointerEvents: context.toastCount > 0 ? undefined : 'none' }}
      >
        {/**
         * tabindex on the the list so that it can be focused when items are removed. we focus
         * the list instead of the viewport so it announces number of items remaining.
         */}
        <Primitive.ol tabIndex={-1} {...viewportProps} ref={composedRefs} />
      </DismissableLayer.Branch>
    );
  }
);

ToastViewport.displayName = VIEWPORT_NAME;

/* -------------------------------------------------------------------------------------------------
 * Toast
 * -----------------------------------------------------------------------------------------------*/

const TOAST_NAME = 'Toast';
const TOAST_SWIPE_START = 'toast.swipeStart';
const TOAST_SWIPE_MOVE = 'toast.swipeMove';
const TOAST_SWIPE_CANCEL = 'toast.swipeCancel';
const TOAST_SWIPE_END = 'toast.swipeEnd';

type ToastElement = ToastImplElement;
interface ToastProps extends Omit<ToastImplProps, keyof ToastImplPrivateProps> {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?(open: boolean): void;
  /**
   * Used to force mounting when more control is needed. Useful when
   * controlling animation with React animation libraries.
   */
  forceMount?: true;
}

const Toast = React.forwardRef<ToastElement, ToastProps>(
  (props: ScopedProps<ToastProps>, forwardedRef) => {
    const { forceMount, open: openProp, defaultOpen, onOpenChange, ...toastProps } = props;
    const [open = true, setOpen] = useControllableState({
      prop: openProp,
      defaultProp: defaultOpen,
      onChange: onOpenChange,
    });

    return (
      <Presence present={forceMount || open}>
        <ToastImpl
          data-state={open ? 'open' : 'closed'}
          {...toastProps}
          ref={forwardedRef}
          onClose={() => setOpen(false)}
          onSwipeStart={composeEventHandlers(props.onSwipeStart, (event) => {
            event.currentTarget.setAttribute('data-swipe', 'start');
          })}
          onSwipeMove={composeEventHandlers(props.onSwipeMove, (event) => {
            const { x, y } = event.detail.delta;
            event.currentTarget.setAttribute('data-swipe', 'move');
            event.currentTarget.style.setProperty('--radix-toast-swipe-move-x', `${x}px`);
            event.currentTarget.style.setProperty('--radix-toast-swipe-move-y', `${y}px`);
          })}
          onSwipeCancel={composeEventHandlers(props.onSwipeCancel, (event) => {
            event.currentTarget.setAttribute('data-swipe', 'cancel');
            event.currentTarget.style.removeProperty('--radix-toast-swipe-move-x');
            event.currentTarget.style.removeProperty('--radix-toast-swipe-move-y');
            event.currentTarget.style.removeProperty('--radix-toast-swipe-end-x');
            event.currentTarget.style.removeProperty('--radix-toast-swipe-end-y');
          })}
          onSwipeEnd={composeEventHandlers(props.onSwipeEnd, (event) => {
            const { x, y } = event.detail.delta;
            event.currentTarget.setAttribute('data-swipe', 'end');
            event.currentTarget.style.removeProperty('--radix-toast-swipe-move-x');
            event.currentTarget.style.removeProperty('--radix-toast-swipe-move-y');
            event.currentTarget.style.setProperty('--radix-toast-swipe-end-x', `${x}px`);
            event.currentTarget.style.setProperty('--radix-toast-swipe-end-y', `${y}px`);
            setOpen(false);
          })}
        />
      </Presence>
    );
  }
);

Toast.displayName = TOAST_NAME;

/* -----------------------------------------------------------------------------------------------*/

type SwipeEvent = { currentTarget: EventTarget & ToastElement } & Omit<
  CustomEvent<{ originalEvent: React.PointerEvent; delta: { x: number; y: number } }>,
  'currentTarget'
>;

const [ToastInteractiveProvider, useToastInteractiveContext] = createToastContext(TOAST_NAME, {
  isInteractive: false,
  onClose() {},
});

type ToastImplElement = React.ElementRef<typeof Primitive.li>;
type DismissableLayerProps = Radix.ComponentPropsWithoutRef<typeof DismissableLayer.Root>;
type ToastImplPrivateProps = { onClose(): void };
type PrimitiveListItemProps = Radix.ComponentPropsWithoutRef<typeof Primitive.li>;
interface ToastImplProps extends ToastImplPrivateProps, PrimitiveListItemProps {
  type?: 'foreground' | 'background';
  /**
   * Time in milliseconds that toast should remain visible for. Overrides value
   * given to `ToastProvider`.
   */
  duration?: number;
  onEscapeKeyDown?: DismissableLayerProps['onEscapeKeyDown'];
  onSwipeStart?(event: SwipeEvent): void;
  onSwipeMove?(event: SwipeEvent): void;
  onSwipeCancel?(event: SwipeEvent): void;
  onSwipeEnd?(event: SwipeEvent): void;
}

const ToastImpl = React.forwardRef<ToastImplElement, ToastImplProps>(
  (props: ScopedProps<ToastImplProps>, forwardedRef) => {
    const {
      __scopeToast,
      type = 'foreground',
      duration: durationProp,
      onClose,
      onSwipeStart,
      onSwipeMove,
      onSwipeCancel,
      onSwipeEnd,
      ...toastProps
    } = props;
    const context = useToastProviderContext(TOAST_NAME, __scopeToast);
    const ref = React.useRef<ToastImplElement>(null);
    const composedRefs = useComposedRefs(forwardedRef, ref);
    const pointerStartRef = React.useRef<{ x: number; y: number } | null>(null);
    const swipeDeltaRef = React.useRef<{ x: number; y: number } | null>(null);
    const duration = durationProp || context.duration;
    const closeTimerRemainingTimeRef = React.useRef(duration);
    const { onToastAdd, onToastRemove } = context;
    const handleClose = useCallbackRef(() => {
      // focus viewport if focus is within toast to read the remaining toast
      // count to SR users and ensure focus isn't lost
      const isFocusInToast = ref.current?.contains(document.activeElement);
      if (isFocusInToast) context.viewport?.focus();
      onClose();
    });

    React.useEffect(() => {
      closeTimerRemainingTimeRef.current = duration;
    }, [duration]);

    React.useEffect(() => {
      if (!context.isClosePaused && duration !== Infinity) {
        const closeTimerStartTime = new Date().getTime();
        const closeTimerRemainingTime = closeTimerRemainingTimeRef.current;
        const closeTimer = window.setTimeout(handleClose, closeTimerRemainingTime);
        return () => {
          const elapsedTime = new Date().getTime() - closeTimerStartTime;
          closeTimerRemainingTimeRef.current = closeTimerRemainingTime - elapsedTime;
          window.clearTimeout(closeTimer);
        };
      }
    }, [duration, context.isClosePaused, handleClose]);

    React.useEffect(() => {
      onToastAdd();
      return () => onToastRemove();
    }, [onToastAdd, onToastRemove]);

    if (!context.viewport) return null;

    return (
      <>
        <ToastAnnounce
          __scopeToast={__scopeToast}
          // Toasts are always role=status to avoid stuttering issues with role=alert in SRs.
          role="status"
          aria-live={type === 'foreground' ? 'assertive' : 'polite'}
          aria-atomic
        >
          {props.children}
        </ToastAnnounce>

        <ToastInteractiveProvider scope={__scopeToast} isInteractive onClose={handleClose}>
          {ReactDOM.createPortal(
            <DismissableLayer.Root
              asChild
              onEscapeKeyDown={composeEventHandlers(props.onEscapeKeyDown, handleClose)}
            >
              <Primitive.li
                role="status"
                aria-live="off"
                aria-atomic
                tabIndex={0}
                data-swipe-direction={context.swipeDirection}
                {...toastProps}
                ref={composedRefs}
                style={{ userSelect: 'none', touchAction: 'none', ...props.style }}
                onPointerDown={composeEventHandlers(props.onPointerDown, (event) => {
                  if (event.button !== 0) return;
                  pointerStartRef.current = { x: event.clientX, y: event.clientY };
                })}
                onPointerMove={composeEventHandlers(props.onPointerMove, (event) => {
                  if (!pointerStartRef.current) return;
                  (event.target as HTMLElement).setPointerCapture(event.pointerId);
                  const x = event.clientX - pointerStartRef.current.x;
                  const y = event.clientY - pointerStartRef.current.y;
                  const hasSwipeMoveStarted = Boolean(swipeDeltaRef.current);
                  const isHorizontalSwipe = ['left', 'right'].includes(context.swipeDirection);
                  const clamp = ['left', 'up'].includes(context.swipeDirection)
                    ? Math.min
                    : Math.max;
                  const clampedX = isHorizontalSwipe ? clamp(0, x) : 0;
                  const clampedY = !isHorizontalSwipe ? clamp(0, y) : 0;
                  const moveStartBuffer = event.pointerType === 'touch' ? 10 : 2;
                  const delta = { x: clampedX, y: clampedY };
                  const eventDetail = { originalEvent: event, delta };
                  if (hasSwipeMoveStarted) {
                    swipeDeltaRef.current = delta;
                    dispatchCustomEvent(TOAST_SWIPE_MOVE, onSwipeMove, eventDetail);
                  } else if (isDeltaInDirection(delta, context.swipeDirection, moveStartBuffer)) {
                    swipeDeltaRef.current = delta;
                    dispatchCustomEvent(TOAST_SWIPE_START, onSwipeStart, eventDetail);
                  } else if (Math.abs(x) > moveStartBuffer || Math.abs(y) > moveStartBuffer) {
                    // User is swiping in wrong direction so we disable swipe gesture
                    // for the current pointer down interaction
                    pointerStartRef.current = null;
                  }
                })}
                onPointerUp={composeEventHandlers(props.onPointerUp, (event) => {
                  const delta = swipeDeltaRef.current;
                  (event.target as HTMLElement).releasePointerCapture(event.pointerId);
                  swipeDeltaRef.current = null;
                  pointerStartRef.current = null;
                  if (delta) {
                    const toast = event.currentTarget;
                    const eventDetail = { originalEvent: event, delta };
                    if (isDeltaInDirection(delta, context.swipeDirection, context.swipeThreshold)) {
                      dispatchCustomEvent(TOAST_SWIPE_END, onSwipeEnd, eventDetail);
                    } else {
                      dispatchCustomEvent(TOAST_SWIPE_CANCEL, onSwipeCancel, eventDetail);
                    }
                    // Prevent click event from triggering on items within the toast when
                    // pointer up is part of a swipe gesture
                    toast.addEventListener('click', (event) => event.preventDefault(), {
                      once: true,
                    });
                  }
                })}
              />
            </DismissableLayer.Root>,
            context.viewport
          )}
        </ToastInteractiveProvider>
      </>
    );
  }
);

ToastImpl.propTypes = {
  type(props) {
    if (props.type && !['foreground', 'background'].includes(props.type)) {
      const error = `Invalid prop \`type\` supplied to \`${TOAST_NAME}\`. Expected \`foreground | background\`.`;
      throw new Error(error);
    }
    return null;
  },
};

/* -----------------------------------------------------------------------------------------------*/

interface ToastAnnounceProps
  extends React.ComponentPropsWithoutRef<'div'>,
    ScopedProps<{ children?: ToastImplProps['children'] }> {}

const ToastAnnounce: React.FC<ToastAnnounceProps> = (props: ScopedProps<ToastAnnounceProps>) => {
  const { __scopeToast, ...announceProps } = props;
  const context = useToastProviderContext(TOAST_NAME, __scopeToast);
  const [renderChildren, setRenderChildren] = React.useState(false);
  const [isAnnounced, setIsAnnounced] = React.useState(false);

  // render children in the next frame to ensure toast is announced in NVDA
  useNextFrame(() => setRenderChildren(true));

  React.useEffect(() => {
    const timer = window.setTimeout(() => setIsAnnounced(true), 1000);
    return () => window.clearTimeout(timer);
  }, []);

  return isAnnounced ? null : (
    <UnstablePortal asChild>
      <VisuallyHidden asChild>
        <div {...announceProps}>
          {renderChildren && (
            <>
              {context.label} {props.children}
            </>
          )}
        </div>
      </VisuallyHidden>
    </UnstablePortal>
  );
};

/* -------------------------------------------------------------------------------------------------
 * ToastTitle
 * -----------------------------------------------------------------------------------------------*/

const TITLE_NAME = 'ToastTitle';

type ToastTitleElement = React.ElementRef<typeof Primitive.div>;
type PrimitiveDivProps = Radix.ComponentPropsWithoutRef<typeof Primitive.div>;
interface ToastTitleProps extends PrimitiveDivProps {}

const ToastTitle = React.forwardRef<ToastTitleElement, ToastTitleProps>(
  (props: ScopedProps<ToastTitleProps>, forwardedRef) => {
    const { __scopeToast, ...titleProps } = props;
    return <Primitive.div {...titleProps} ref={forwardedRef} />;
  }
);

ToastTitle.displayName = TITLE_NAME;

/* -------------------------------------------------------------------------------------------------
 * ToastDescription
 * -----------------------------------------------------------------------------------------------*/

const DESCRIPTION_NAME = 'ToastDescription';

type ToastDescriptionElement = React.ElementRef<typeof Primitive.div>;
interface ToastDescriptionProps extends PrimitiveDivProps {}

const ToastDescription = React.forwardRef<ToastDescriptionElement, ToastDescriptionProps>(
  (props: ScopedProps<ToastDescriptionProps>, forwardedRef) => {
    const { __scopeToast, ...descriptionProps } = props;
    return <Primitive.div {...descriptionProps} ref={forwardedRef} />;
  }
);

ToastDescription.displayName = DESCRIPTION_NAME;

/* -------------------------------------------------------------------------------------------------
 * ToastAction
 * -----------------------------------------------------------------------------------------------*/

const ACTION_NAME = 'ToastAction';

type ToastActionElement = ToastCloseElement;
interface ToastActionProps extends ToastCloseProps {
  /**
   * A short description for an alternate way to carry out the action. For screen reader users
   * who will not be able to navigate to the button easily/quickly.
   * @example <ToastAction altText="Goto account settings to updgrade">Upgrade</ToastAction>
   * @example <ToastAction altText="Undo (Alt+U)">Undo</ToastAction>
   */
  altText: string;
}

const ToastAction = React.forwardRef<ToastActionElement, ToastActionProps>(
  (props: ScopedProps<ToastActionProps>, forwardedRef) => {
    const { altText, ...actionProps } = props;
    const context = useToastInteractiveContext(ACTION_NAME, props.__scopeToast);
    if (!altText) return null;
    return context.isInteractive ? (
      <ToastClose {...actionProps} ref={forwardedRef} />
    ) : (
      <span>{altText}</span>
    );
  }
);

ToastAction.propTypes = {
  altText(props) {
    if (!props.altText) {
      throw new Error(`Missing prop \`altText\` expected on \`${ACTION_NAME}\``);
    }
    return null;
  },
};

ToastAction.displayName = ACTION_NAME;

/* -------------------------------------------------------------------------------------------------
 * ToastClose
 * -----------------------------------------------------------------------------------------------*/

const CLOSE_NAME = 'ToastClose';

type ToastCloseElement = React.ElementRef<typeof Primitive.button>;
type PrimitiveButtonProps = Radix.ComponentPropsWithoutRef<typeof Primitive.button>;
interface ToastCloseProps extends PrimitiveButtonProps {}

const ToastClose = React.forwardRef<ToastCloseElement, ToastCloseProps>(
  (props: ScopedProps<ToastCloseProps>, forwardedRef) => {
    const { __scopeToast, ...closeProps } = props;
    const interactiveContext = useToastInteractiveContext(CLOSE_NAME, __scopeToast);
    return interactiveContext.isInteractive ? (
      <Primitive.button
        type="button"
        {...closeProps}
        ref={forwardedRef}
        onClick={composeEventHandlers(props.onClick, interactiveContext.onClose)}
      />
    ) : null;
  }
);

ToastClose.displayName = CLOSE_NAME;

/* ---------------------------------------------------------------------------------------------- */

function dispatchCustomEvent<E extends CustomEvent, ReactEvent extends React.SyntheticEvent>(
  name: string,
  handler: ((event: E) => void) | undefined,
  detail: { originalEvent: ReactEvent } & (E extends CustomEvent<infer D> ? D : never)
) {
  const currentTarget = detail.originalEvent.currentTarget as HTMLElement;
  const event = new CustomEvent(name, { bubbles: true, cancelable: true, detail });
  if (handler) currentTarget.addEventListener(name, handler as EventListener, { once: true });
  currentTarget.dispatchEvent(event);
}

const isDeltaInDirection = (
  delta: { x: number; y: number },
  direction: SwipeDirection,
  threshold = 0
) => {
  const deltaX = Math.abs(delta.x);
  const deltaY = Math.abs(delta.y);
  const isDeltaX = deltaX > deltaY;
  if (direction === 'left' || direction === 'right') {
    return isDeltaX && deltaX > threshold;
  } else {
    return !isDeltaX && deltaY > threshold;
  }
};

function useNextFrame(callback = () => {}) {
  const fn = useCallbackRef(callback);
  useLayoutEffect(() => {
    let raf1 = 0;
    let raf2 = 0;
    raf1 = window.requestAnimationFrame(() => (raf2 = window.requestAnimationFrame(fn)));
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
    };
  }, [fn]);
}

const Provider = ToastProvider;
const Viewport = ToastViewport;
const Root = Toast;
const Title = ToastTitle;
const Description = ToastDescription;
const Action = ToastAction;
const Close = ToastClose;

export {
  createToastScope,
  //
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastAction,
  ToastClose,
  //
  Provider,
  Viewport,
  Root,
  Title,
  Description,
  Action,
  Close,
};
export type {
  ToastProviderProps,
  ToastViewportProps,
  ToastProps,
  ToastTitleProps,
  ToastDescriptionProps,
  ToastActionProps,
  ToastCloseProps,
};